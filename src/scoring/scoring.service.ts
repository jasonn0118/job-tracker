import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Job } from '../jobs/jobs.service';

export interface ScoredJob extends Job {
  score: number;
  scoreReason: string;
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);
  private readonly anthropic: Anthropic;

  private readonly RESUME = `
Jeamin Shin — Intermediate Software Developer (Vancouver, BC), ~4 years experience
Skills: React, Next.js, NestJS, Node.js, TypeScript, Ruby on Rails, GraphQL, TypeORM,
PostgreSQL, AWS (S3, Lambda, RDS, SQS, Cognito), Redis, pgvector, React Native/Expo,
Tailwind, Redux, CI/CD, GitHub Actions
Experience:
- Beezly (Aug 2025–Present): NestJS monorepo, AWS migration, vector similarity search, CI/CD
- Rennie (May 2021–Nov 2024): Next.js + TypeScript UI rebuild, NestJS backend,
  federated GraphQL APIs, Redis caching, interactive property map
Projects: IntelliStock.io — Next.js 15 + NestJS, GPT insight engine for 9000+ Nasdaq instruments
Looking for: Intermediate full-stack or backend roles (NOT senior, NOT junior)
Location: Vancouver, BC (open to remote)
  `.trim();

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async scoreJobs(jobs: Job[]): Promise<ScoredJob[]> {
    if (jobs.length === 0) {
      this.logger.log('No jobs to score');
      return [];
    }

    this.logger.log(`Scoring ${jobs.length} jobs with Claude Opus 4.5 (batched with prompt caching)...`);

    try {
      const jobsJson = jobs.map((job, idx) => ({
        index: idx,
        title: job.title,
        company: job.company,
        location: job.location,
        snippet: job.snippet,
        tags: job.tags,
        source: job.source,
      }));

      const message = await this.anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 8000,
        temperature: 0.3,
        system: [
          {
            type: 'text',
            text: `You are a job matching expert. Score each job posting against this candidate's resume.

--- CANDIDATE RESUME ---
${this.RESUME}
--- END RESUME ---

--- SCORING RUBRIC ---
* 80-100: Strong intermediate match, candidate's exact stack (React/Next.js/NestJS/TypeScript/Node.js/AWS)
* 60-79: Related stack, some gaps (e.g., different backend framework, but similar level)
* 40-59: Adjacent role or partial match (e.g., frontend-only when candidate prefers full-stack)
* Below 40: Wrong level (senior/lead or junior) OR very different stack

IMPORTANT PENALTIES:
- Deduct 30+ points if role requires 7+ years experience or is clearly senior/lead/principal/staff
- Deduct 20+ points if role is junior/entry-level/new-grad/intern
- Candidate is seeking INTERMEDIATE level (4 years experience)`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Score these ${jobs.length} jobs:

${JSON.stringify(jobsJson, null, 2)}

For each job, respond with EXACTLY this JSON array format (no extra text):
[
  {"index": 0, "score": 85, "reason": "Strong NestJS + TypeScript backend match in Vancouver, intermediate level"},
  {"index": 1, "score": 72, "reason": "Full-stack React + Node.js role, good fit but minimal backend description"},
  ...
]

Your JSON array:`,
          },
        ],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const scoredJobs = this.parseScoresFromResponse(responseText, jobs);

      // Log cache usage for monitoring
      if (message.usage) {
        this.logger.log(
          `Cache stats: ${message.usage.cache_creation_input_tokens || 0} tokens cached, ` +
          `${message.usage.cache_read_input_tokens || 0} tokens read from cache`,
        );
      }

      this.logger.log(`Successfully scored ${scoredJobs.length} jobs`);
      return scoredJobs;
    } catch (err) {
      this.logger.error(`Failed to score jobs: ${err.message}`);
      // Return jobs with fallback scores
      return jobs.map(job => ({
        ...job,
        score: 50,
        scoreReason: 'Scoring failed - manual review needed',
      }));
    }
  }


  private parseScoresFromResponse(responseText: string, jobs: Job[]): ScoredJob[] {
    try {
      // Extract JSON array from response
      const jsonMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (!jsonMatch) {
        this.logger.warn('Could not parse JSON from Claude response, using fallback scores');
        return this.fallbackScores(jobs);
      }

      const scores = JSON.parse(jsonMatch[0]);

      // Map scores back to jobs
      return jobs.map((job, idx) => {
        const scoreData = scores.find((s: any) => s.index === idx);
        if (!scoreData) {
          this.logger.warn(`No score found for job at index ${idx}, using fallback`);
          return {
            ...job,
            score: 50,
            scoreReason: 'Score not returned by AI',
          };
        }

        return {
          ...job,
          score: scoreData.score,
          scoreReason: scoreData.reason,
        };
      });
    } catch (err) {
      this.logger.error(`Failed to parse scores: ${err.message}`);
      return this.fallbackScores(jobs);
    }
  }

  private fallbackScores(jobs: Job[]): ScoredJob[] {
    return jobs.map(job => ({
      ...job,
      score: 50,
      scoreReason: 'Scoring failed - manual review needed',
    }));
  }
}
