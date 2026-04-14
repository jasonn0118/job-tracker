import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as FormData from 'form-data';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
} from 'docx';
import { ScoredJob } from '../scoring/scoring.service';

interface TailoredResume {
  tailoredBullets: {
    [role: string]: string[];
  };
  changes: string[];
  summary: string;
}

export interface BaseResume {
  name: string;
  contact: {
    email: string;
    phone: string;
    github: string;
    linkedin: string;
    portfolio: string;
  };
  skills: {
    [category: string]: string;
  };
  certifications?: Array<{
    name: string;
    issueDate: string;
  }>;
  experience: Array<{
    company: string;
    period: string;
    title: string;
    location: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    title: string;
    bullets: string[];
  }>;
  education: Array<{
    school: string;
    degree: string;
    period: string;
  }>;
}

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);
  private readonly anthropic: Anthropic;
  private readonly RESUME_FILE_PATH = path.join(process.cwd(), 'data', 'base-resume.json');

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  getBaseResume(): BaseResume {
    try {
      const fileContent = fs.readFileSync(this.RESUME_FILE_PATH, 'utf-8');
      const resume: BaseResume = JSON.parse(fileContent);
      if (process.env.RESUME_EMAIL) resume.contact.email = process.env.RESUME_EMAIL;
      if (process.env.RESUME_PHONE) resume.contact.phone = process.env.RESUME_PHONE;
      if (process.env.RESUME_GITHUB) resume.contact.github = process.env.RESUME_GITHUB;
      if (process.env.RESUME_LINKEDIN) resume.contact.linkedin = process.env.RESUME_LINKEDIN;
      return resume;
    } catch (error) {
      this.logger.error(`Failed to read resume file: ${error.message}`);
      throw new Error('Resume file not found. Please create data/base-resume.json');
    }
  }

  updateBaseResume(resume: BaseResume): void {
    try {
      fs.writeFileSync(this.RESUME_FILE_PATH, JSON.stringify(resume, null, 2), 'utf-8');
      this.logger.log('Resume updated successfully');
    } catch (error) {
      this.logger.error(`Failed to update resume: ${error.message}`);
      throw new Error('Failed to update resume file');
    }
  }

  async tailorAndNotify(job: ScoredJob): Promise<void> {
    try {
      this.logger.log(`Tailoring resume for: ${job.title} at ${job.company}`);

      // Step 1: Tailor resume with Claude
      const tailoredResume = await this.tailorResume(job);

      // Step 2: Generate DOCX
      const filePath = await this.generateDocx(job, tailoredResume);

      // Step 3: Send to Slack
      await this.sendToSlack(job, tailoredResume, filePath);

      this.logger.log(`Successfully tailored and notified for ${job.company}`);
    } catch (err) {
      this.logger.error(`Failed to tailor resume for ${job.company}: ${err.message}`);
    }
  }

  private async tailorResume(job: ScoredJob): Promise<TailoredResume> {
    const baseResume = this.getBaseResume();

    const bulletsByRole = [
      ...baseResume.experience.map(exp => ({
        key: exp.company,
        label: `${exp.company} (${exp.title})`,
        bullets: exp.bullets,
      })),
      ...baseResume.projects.map(proj => ({
        key: proj.name,
        label: `${proj.name} (${proj.title})`,
        bullets: proj.bullets,
      })),
    ];

    const bulletsSection = bulletsByRole
      .map(role => `### ${role.label}\n${role.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}`)
      .join('\n\n');

    const responseKeys = bulletsByRole.map(r => `"${r.key}": ["bullet 1", "bullet 2", ...]`).join(',\n    ');

    const prompt = `You are an expert resume writer. Given a job posting and resume bullets grouped by role, reword the bullets to better match the job posting language.

Rules:
- NEVER invent new experience or skills
- ONLY reword/reorder bullets WITHIN each role — do NOT move bullets between roles
- Match keywords from the job posting when appropriate
- Keep bullets concise and impactful
- Maintain truthfulness - don't exaggerate

Job Title: ${job.title}
Company: ${job.company}
Job Description:
${job.snippet}

Current Resume Bullets (grouped by role):
${bulletsSection}

Respond with JSON only:
{
  "tailoredBullets": {
    ${responseKeys}
  },
  "changes": ["Changed X to match Y keyword", "Reordered Z for emphasis", ...],
  "summary": "Brief 2-3 sentence summary of tailoring strategy"
}`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Claude response');
    }

    return JSON.parse(jsonMatch[0]);
  }

  private async generateDocx(job: ScoredJob, tailored: TailoredResume): Promise<string> {
    const baseResume = this.getBaseResume();
    const date = new Date().toISOString().split('T')[0];
    const filename = `Jeamin_Shin_Resume_${job.company.replace(/[^a-zA-Z0-9]/g, '_')}_${date}.docx`;
    const outputPath = path.join(process.cwd(), 'resumes', filename);

    // Ensure resumes directory exists
    const resumesDir = path.join(process.cwd(), 'resumes');
    if (!fs.existsSync(resumesDir)) {
      fs.mkdirSync(resumesDir, { recursive: true });
    }

    const BODY = 20;    // 10pt
    const HEADER = 22;  // 11pt
    const NAME = 32;    // 16pt
    const CONTACT = 18; // 9pt

    const sectionHeading = (text: string) =>
      new Paragraph({
        thematicBreak: true,
        spacing: { before: 240, after: 80 },
        children: [new TextRun({ text, bold: true, size: HEADER })],
      });

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
            },
          },
          children: [
            // Name
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 60 },
              children: [new TextRun({ text: baseResume.name, bold: true, size: NAME })],
            }),
            // Contact
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 80 },
              children: [
                new TextRun({
                  text: `${baseResume.contact.email} | ${baseResume.contact.phone} | ${baseResume.contact.github} | ${baseResume.contact.linkedin}`,
                  size: CONTACT,
                }),
              ],
            }),

            // Skills
            sectionHeading('SKILLS'),
            ...Object.entries(baseResume.skills).map(
              ([category, skills]) =>
                new Paragraph({
                  spacing: { before: 0, after: 40 },
                  children: [
                    new TextRun({ text: `${category}: `, bold: true, size: BODY }),
                    new TextRun({ text: skills, size: BODY }),
                  ],
                }),
            ),

            // Certifications (if present)
            ...(baseResume.certifications && baseResume.certifications.length > 0
              ? [
                  sectionHeading('CERTIFICATIONS'),
                  ...baseResume.certifications.map(
                    cert =>
                      new Paragraph({
                        spacing: { before: 0, after: 40 },
                        children: [
                          new TextRun({ text: cert.name, bold: true, size: BODY }),
                          new TextRun({ text: ` — Issued ${cert.issueDate}`, size: BODY }),
                        ],
                      }),
                  ),
                ]
              : []),

            // Experience
            sectionHeading('EXPERIENCE'),
            ...baseResume.experience.flatMap(exp => [
              new Paragraph({
                spacing: { before: 60, after: 40 },
                children: [
                  new TextRun({ text: exp.company, bold: true, size: BODY }),
                  new TextRun({ text: ` (${exp.period})`, size: BODY }),
                  new TextRun({ text: ` — ${exp.title}, ${exp.location}`, italics: true, size: BODY }),
                ],
              }),
              ...(tailored.tailoredBullets[exp.company] || exp.bullets).map(
                bullet =>
                  new Paragraph({
                    spacing: { before: 0, after: 40 },
                    indent: { left: 240 },
                    children: [new TextRun({ text: `• ${bullet}`, size: BODY })],
                  }),
              ),
            ]),

            // Projects
            sectionHeading('PROJECTS'),
            ...baseResume.projects.flatMap(proj => [
              new Paragraph({
                spacing: { before: 60, after: 40 },
                children: [
                  new TextRun({ text: proj.name, bold: true, size: BODY }),
                  new TextRun({ text: ` — ${proj.title}`, italics: true, size: BODY }),
                ],
              }),
              ...(tailored.tailoredBullets[proj.name] || proj.bullets).map(
                bullet =>
                  new Paragraph({
                    spacing: { before: 0, after: 40 },
                    indent: { left: 240 },
                    children: [new TextRun({ text: `• ${bullet}`, size: BODY })],
                  }),
              ),
            ]),

            // Education
            sectionHeading('EDUCATION'),
            ...baseResume.education.map(
              edu =>
                new Paragraph({
                  spacing: { before: 0, after: 40 },
                  children: [
                    new TextRun({ text: edu.school, bold: true, size: BODY }),
                    new TextRun({ text: ` — ${edu.degree} (${edu.period})`, size: BODY }),
                  ],
                }),
            ),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);

    this.logger.log(`Generated resume: ${filename}`);
    return outputPath;
  }

  private async sendToSlack(job: ScoredJob, tailored: TailoredResume, filePath: string): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    const botToken = process.env.SLACK_BOT_TOKEN;
    const channelId = process.env.SLACK_CHANNEL_ID;

    if (!webhookUrl && !botToken) {
      this.logger.warn('No Slack credentials configured, skipping notification');
      return;
    }

    // Send formatted message via webhook
    if (webhookUrl) {
      const changes = tailored.changes.slice(0, 5).map(c => `• ${c}`).join('\n');
      const message = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🎯 New Job Match: ${job.company}`,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Title:*\n${job.title}`,
              },
              {
                type: 'mrkdwn',
                text: `*Score:*\n${job.score}/100`,
              },
              {
                type: 'mrkdwn',
                text: `*Location:*\n${job.location}`,
              },
              {
                type: 'mrkdwn',
                text: `*Source:*\n${job.source}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Resume Tailoring Summary:*\n${tailored.summary}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Key Changes:*\n${changes}`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Apply Now',
                },
                url: job.link,
                style: 'primary',
              },
            ],
          },
        ],
      };

      try {
        const response = await axios.post(webhookUrl, message);
        this.logger.log(`Sent Slack webhook message - Status: ${response.status}`);
        if (response.data && response.data !== 'ok') {
          this.logger.warn(`Slack webhook response: ${JSON.stringify(response.data)}`);
        }
      } catch (err) {
        this.logger.error(`Failed to send Slack webhook: ${err.message}`);
        if (err.response) {
          this.logger.error(`Slack webhook error response: ${JSON.stringify(err.response.data)}`);
        }
      }
    }

    // Upload file via bot token using new files.uploadV2 API
    if (botToken && channelId && fs.existsSync(filePath)) {
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const filename = path.basename(filePath);

        // Step 1: Get upload URL
        const getUrlParams = new URLSearchParams();
        getUrlParams.append('filename', filename);
        getUrlParams.append('length', fileBuffer.length.toString());

        const getUrlResponse = await axios.post(
          'https://slack.com/api/files.getUploadURLExternal',
          getUrlParams,
          {
            headers: {
              Authorization: `Bearer ${botToken}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        );

        if (!getUrlResponse.data.ok) {
          this.logger.error(`Failed to get upload URL: ${getUrlResponse.data.error}`);
          return;
        }

        const uploadUrl = getUrlResponse.data.upload_url;
        const fileId = getUrlResponse.data.file_id;

        // Step 2: Upload file to the URL
        await axios.post(uploadUrl, fileBuffer, {
          headers: {
            'Content-Type': 'application/octet-stream',
          },
        });

        // Step 3: Complete the upload
        const completeResponse = await axios.post(
          'https://slack.com/api/files.completeUploadExternal',
          {
            files: [
              {
                id: fileId,
                title: `Resume for ${job.company}`,
              },
            ],
            channel_id: channelId,
          },
          {
            headers: {
              Authorization: `Bearer ${botToken}`,
              'Content-Type': 'application/json',
            },
          },
        );

        if (completeResponse.data.ok) {
          this.logger.log(`Uploaded resume to Slack - File: ${filename}`);
        } else {
          this.logger.error(`Slack file upload completion failed: ${completeResponse.data.error}`);
        }
      } catch (err) {
        this.logger.error(`Failed to upload file to Slack: ${err.message}`);
        if (err.response) {
          this.logger.error(`Slack file upload error response: ${JSON.stringify(err.response.data)}`);
        }
      }
    } else if (botToken && channelId) {
      this.logger.warn(`Resume file not found at ${filePath}`);
    }
  }
}
