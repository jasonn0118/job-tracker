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
  HeadingLevel,
  AlignmentType,
  UnderlineType,
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
    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  getBaseResume(): BaseResume {
    try {
      const fileContent = fs.readFileSync(this.RESUME_FILE_PATH, 'utf-8');
      return JSON.parse(fileContent);
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
    const allBullets = [
      ...baseResume.experience.flatMap(exp => exp.bullets),
      ...baseResume.projects.flatMap(proj => proj.bullets),
    ];

    const prompt = `You are an expert resume writer. Given a job posting and resume bullets, reword the bullets to better match the job posting language.

Rules:
- NEVER invent new experience or skills
- ONLY reword/reorder existing bullets
- Match keywords from the job posting when appropriate
- Keep bullets concise and impactful
- Maintain truthfulness - don't exaggerate

Job Title: ${job.title}
Company: ${job.company}
Job Description:
${job.snippet}

Current Resume Bullets:
${allBullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}

Respond with JSON only:
{
  "tailoredBullets": {
    "Beezly": ["bullet 1", "bullet 2", ...],
    "Rennie": ["bullet 1", "bullet 2", ...],
    "IntelliStock.io": ["bullet 1", "bullet 2", ...]
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

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            // Name
            new Paragraph({
              text: baseResume.name,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
            }),
            // Contact
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `${baseResume.contact.email} | ${baseResume.contact.phone} | ${baseResume.contact.github} | ${baseResume.contact.linkedin} | ${baseResume.contact.portfolio}`,
                  size: 20,
                }),
              ],
            }),
            new Paragraph({ text: '' }), // spacing

            // Skills
            new Paragraph({
              text: 'SKILLS',
              heading: HeadingLevel.HEADING_2,
              thematicBreak: true,
            }),
            ...Object.entries(baseResume.skills).map(
              ([category, skills]) =>
                new Paragraph({
                  children: [
                    new TextRun({ text: `${category}: `, bold: true }),
                    new TextRun({ text: skills }),
                  ],
                }),
            ),
            new Paragraph({ text: '' }),

            // Certifications (if present)
            ...(baseResume.certifications && baseResume.certifications.length > 0
              ? [
                  new Paragraph({
                    text: 'CERTIFICATIONS',
                    heading: HeadingLevel.HEADING_2,
                    thematicBreak: true,
                  }),
                  ...baseResume.certifications.map(
                    cert =>
                      new Paragraph({
                        children: [
                          new TextRun({ text: cert.name, bold: true }),
                          new TextRun({ text: ` — Issued ${cert.issueDate}` }),
                        ],
                      }),
                  ),
                  new Paragraph({ text: '' }),
                ]
              : []),

            // Experience
            new Paragraph({
              text: 'EXPERIENCE',
              heading: HeadingLevel.HEADING_2,
              thematicBreak: true,
            }),
            ...baseResume.experience.flatMap(exp => [
              new Paragraph({
                children: [
                  new TextRun({ text: exp.company, bold: true }),
                  new TextRun({ text: ` (${exp.period})` }),
                  new TextRun({ text: ` — ${exp.title}, ${exp.location}`, italics: true }),
                ],
              }),
              ...(tailored.tailoredBullets[exp.company] || exp.bullets).map(
                bullet =>
                  new Paragraph({
                    text: `• ${bullet}`,
                    bullet: { level: 0 },
                  }),
              ),
              new Paragraph({ text: '' }),
            ]),

            // Projects
            new Paragraph({
              text: 'PROJECTS',
              heading: HeadingLevel.HEADING_2,
              thematicBreak: true,
            }),
            ...baseResume.projects.flatMap(proj => [
              new Paragraph({
                children: [
                  new TextRun({ text: proj.name, bold: true }),
                  new TextRun({ text: ` — ${proj.title}`, italics: true }),
                ],
              }),
              ...(tailored.tailoredBullets[proj.name] || proj.bullets).map(
                bullet =>
                  new Paragraph({
                    text: `• ${bullet}`,
                    bullet: { level: 0 },
                  }),
              ),
              new Paragraph({ text: '' }),
            ]),

            // Education
            new Paragraph({
              text: 'EDUCATION',
              heading: HeadingLevel.HEADING_2,
              thematicBreak: true,
            }),
            ...baseResume.education.map(
              edu =>
                new Paragraph({
                  children: [
                    new TextRun({ text: edu.school, bold: true }),
                    new TextRun({ text: ` — ${edu.degree} (${edu.period})` }),
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
