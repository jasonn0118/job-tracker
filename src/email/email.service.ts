import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ScoredJob } from '../scoring/scoring.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  async sendDailyDigest(scoredJobs: ScoredJob[]): Promise<void> {
    const topJobs = scoredJobs
      .filter(job => job.score >= 70)
      .sort((a, b) => b.score - a.score);

    const date = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const subject = `Your daily job matches — ${date} (${topJobs.length} top matches)`;
    const html = this.buildEmailHtml(topJobs, date);

    try {
      await this.transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: process.env.DIGEST_TO_EMAIL,
        subject,
        html,
      });

      this.logger.log(`Daily digest sent to ${process.env.DIGEST_TO_EMAIL} (${topJobs.length} top matches)`);
    } catch (err) {
      this.logger.error(`Failed to send daily digest: ${err.message}`);
    }
  }

  private buildEmailHtml(topJobs: ScoredJob[], date: string): string {
    if (topJobs.length === 0) {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 10px 0 0 0; opacity: 0.9; }
    .no-matches { background: #f7fafc; border: 1px solid #e2e8f0; padding: 30px; border-radius: 8px; text-align: center; }
    .no-matches p { margin: 0; font-size: 18px; color: #718096; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📭 No strong matches today</h1>
    <p>${date}</p>
  </div>
  <div class="no-matches">
    <p>No jobs scored 75+ today. Keep your head up — better matches are coming!</p>
  </div>
</body>
</html>
      `;
    }

    const jobsHtml = topJobs
      .map(
        job => `
    <div class="job-card">
      <div class="job-header">
        <div>
          <h2 class="job-title">${this.escapeHtml(job.title)}</h2>
          <p class="job-company">${this.escapeHtml(job.company)} · ${this.escapeHtml(job.location)}</p>
        </div>
        <div class="score-badge score-${this.getScoreTier(job.score)}">${job.score}</div>
      </div>
      <p class="job-reason">${this.escapeHtml(job.scoreReason)}</p>
      <a href="${job.link}" class="apply-btn">Apply Now →</a>
    </div>
  `,
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f7fafc; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 10px 0 0 0; opacity: 0.9; }
    .job-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin-bottom: 20px; }
    .job-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .job-title { margin: 0 0 8px 0; font-size: 20px; color: #1a202c; }
    .job-company { margin: 0; color: #718096; font-size: 14px; }
    .score-badge { background: #48bb78; color: white; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; }
    .score-excellent { background: #48bb78; }
    .score-good { background: #4299e1; }
    .job-reason { color: #4a5568; margin: 0 0 16px 0; font-size: 15px; }
    .apply-btn { display: inline-block; background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; }
    .apply-btn:hover { background: #5a67d8; }
    .footer { text-align: center; margin-top: 30px; color: #a0aec0; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎯 Your Daily Job Matches</h1>
    <p>${date} · ${topJobs.length} top ${topJobs.length === 1 ? 'match' : 'matches'}</p>
  </div>
  ${jobsHtml}
  <div class="footer">
    <p>Job Tracker Backend · Powered by Claude AI</p>
  </div>
</body>
</html>
    `;
  }

  private getScoreTier(score: number): string {
    if (score >= 90) return 'excellent';
    if (score >= 80) return 'excellent';
    return 'good';
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
