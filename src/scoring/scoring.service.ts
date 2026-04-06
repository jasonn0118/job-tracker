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

    this.logger.log(`Scoring ${jobs.length} jobs with Claude Sonnet 4.5 (batched with prompt caching)...`);

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
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        temperature: 0.3,
        system: [
          {
            type: 'text',
            text: `You are a job matching expert. Score each job posting against this candidate's resume.

--- CANDIDATE RESUME ---
${this.RESUME}
--- END RESUME ---

--- SCORING RUBRIC (EVIDENCE-BASED ONLY - NO ASSUMPTIONS) ---

🚫 CRITICAL: Score ONLY based on what's EXPLICITLY stated in job title, snippet, and tags. DO NOT assume tech stacks.

RANKING PRIORITY: Full-stack/Backend > Frontend > Generic roles

EXACT STACK MATCHES (use title/snippet/tags as evidence):
* 90-100: Full-stack/Backend with React+Node.js OR Next.js+NestJS OR TypeScript+Node.js (explicit mentions)
* 80-89: Full-stack/Backend with React OR TypeScript OR Node.js (partial stack match, explicit)
* 70-79: Frontend with React+TypeScript (explicit mentions) - good but lower than full-stack
* 65-74: Frontend with React OR TypeScript (explicit mention) - acceptable but not preferred
* 60-69: Full-stack/Backend/Software Engineer (generic, NO stack info) - intermediate level, neutral score

GENERIC/UNCLEAR ROLES (when NO tech stack mentioned):
* 60-65: "Software Engineer", "Full Stack Developer", "Backend Developer" with NO stack details
  - Score based on role type only (full-stack/backend > frontend)
  - DO NOT assume what tech they use based on company
  - Example: "Software Engineer at Amazon" = 60-65 (DON'T assume Java)

ADJACENT STACKS (explicit mentions only):
* 45-59: Vue.js, Angular, Express.js - transferable but different from candidate's primary stack
* 20-44: WRONG STACK - .NET/C#, Java/Spring, Python/Django, Go, Rust (ONLY if explicitly stated)

LEVEL PENALTIES (always apply):
* Deduct 30+ points: Senior, Lead, Principal, Staff, 7+ years
* Deduct 20+ points: Junior, Entry-level, New grad, Intern, 0-2 years

🎯 SCORING EXAMPLES:
- "Full Stack Engineer - React, Node.js, TypeScript" → 95 (exact match)
- "Backend Developer - NestJS, GraphQL" → 92 (exact match)
- "React Developer - TypeScript, Redux" → 75 (frontend, good stack)
- "Frontend Developer - React" → 68 (frontend, partial)
- "Software Engineer" (no stack info) → 60-65 (neutral, no assumptions)
- "Full Stack Developer" (no stack info) → 65 (generic full-stack)
- "Backend Engineer at Amazon" (no stack) → 60-65 (DON'T assume Java)
- "Full Stack Developer - .NET, C#" → 30 (wrong stack, explicit)

LOCATION: Bonus applied separately (+10 remote, +5 hybrid, +0 onsite)`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Score these ${jobs.length} jobs AND analyze their work location type:

${JSON.stringify(jobsJson, null, 2)}

For each job, analyze the title, location, and description to determine:
1. Base score (0-100) based on skills/experience match
2. Location type: "remote", "hybrid", or "onsite"

Respond with EXACTLY this JSON array format (no extra text):
[
  {"index": 0, "score": 85, "reason": "Strong NestJS + TypeScript backend match in Vancouver, intermediate level", "locationType": "remote"},
  {"index": 1, "score": 72, "reason": "Full-stack React + Node.js role, good fit but minimal backend description", "locationType": "hybrid"},
  {"index": 2, "score": 68, "reason": "Good React skills match, TypeScript experience", "locationType": "onsite"},
  ...
]

Your JSON array:`,
          },
        ],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const scoredJobs = this.parseScoresFromResponse(responseText, jobs);

      // Apply location bonuses: Remote (+10), Hybrid (+5), On-site (0)
      const scoredWithLocationBonus = this.applyLocationBonus(scoredJobs);

      // Log token usage for monitoring
      if (message.usage) {
        this.logger.log(
          `Token usage: ${message.usage.input_tokens || 0} input, ` +
          `${message.usage.output_tokens || 0} output | ` +
          `Cache: ${message.usage.cache_creation_input_tokens || 0} created, ` +
          `${message.usage.cache_read_input_tokens || 0} read`,
        );
      }

      this.logger.log(`Successfully scored ${scoredWithLocationBonus.length} jobs`);
      return scoredWithLocationBonus;
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
            locationType: 'onsite', // default fallback
          };
        }

        return {
          ...job,
          score: scoreData.score,
          scoreReason: scoreData.reason,
          locationType: scoreData.locationType || 'onsite',
        };
      });
    } catch (err) {
      this.logger.error(`Failed to parse scores: ${err.message}`);
      return this.fallbackScores(jobs);
    }
  }

  private applyLocationBonus(scoredJobs: ScoredJob[]): ScoredJob[] {
    return scoredJobs.map(job => {
      const locationType = (job as any).locationType || 'onsite';

      let bonus = 0;
      let bonusReason = '';

      // Apply bonus based on Claude's location analysis
      if (locationType === 'remote') {
        bonus = 10;
        bonusReason = ' (+10 for remote)';
      } else if (locationType === 'hybrid') {
        bonus = 5;
        bonusReason = ' (+5 for hybrid)';
      }
      // onsite gets no bonus

      // Cap score at 100
      const newScore = Math.min(100, job.score + bonus);

      return {
        ...job,
        score: newScore,
        scoreReason: job.scoreReason + bonusReason,
      };
    });
  }

  private fallbackScores(jobs: Job[]): ScoredJob[] {
    return jobs.map(job => ({
      ...job,
      score: 50,
      scoreReason: 'Scoring failed - manual review needed',
    }));
  }
}
