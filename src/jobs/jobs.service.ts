import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import * as xml2js from 'xml2js';
import { ScoringService, ScoredJob } from '../scoring/scoring.service';
import { EmailService } from '../email/email.service';

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  link: string;
  snippet: string;
  tags: string[];
  posted: string;
  score?: number;
  scoreReason?: string;
}

// Keywords to filter OUT (senior/lead roles, interns, new grads - allow junior/entry level)
const EXCLUDE_TITLE_KEYWORDS = [
  'senior', 'sr.', 'sr ', 'lead', 'principal', 'staff', 'director',
  'manager', 'head of', 'architect', 'vp ', 'vice president',
  'intern', 'new grad', 'graduate',
];

// Skills to look for when auto-tagging
const SKILL_KEYWORDS = [
  'TypeScript', 'JavaScript', 'React', 'Next.js', 'NestJS', 'Node.js',
  'GraphQL', 'PostgreSQL', 'AWS', 'Redis', 'Docker', 'Kubernetes',
  'Ruby on Rails', 'Rails', 'React Native', 'Expo', 'Tailwind',
  'TypeORM', 'REST', 'CI/CD', 'GitHub Actions', 'Lambda', 'S3',
];

function extractTags(text: string): string[] {
  const lower = text.toLowerCase();
  return SKILL_KEYWORDS.filter(k => lower.includes(k.toLowerCase()));
}

function isSuitableLevel(title: string): boolean {
  const lower = title.toLowerCase();
  return !EXCLUDE_TITLE_KEYWORDS.some(kw => lower.includes(kw));
}

function dedupe(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  return jobs.filter(j => {
    const key = `${j.title.toLowerCase()}-${j.company.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private cachedJobs: ScoredJob[] = [];
  private lastFetched: Date | null = null;

  constructor(
    private readonly scoringService: ScoringService,
    private readonly emailService: EmailService,
  ) {}

  // ─── Indeed RSS ───────────────────────────────────────────────────────────
  // Indeed's public RSS requires no API key. Queries are URL-encoded search terms.
  // We use allorigins.win as a CORS proxy when calling from a browser,
  // but from this Node backend we call Indeed directly.
  private readonly indeedQueries = [
    { q: 'backend developer typescript', l: 'Vancouver BC' },
    { q: 'backend engineer node.js', l: 'Vancouver BC' },
    { q: 'full stack developer typescript', l: 'Vancouver BC' },
    { q: 'full stack engineer', l: 'Vancouver BC' },
    { q: 'software engineer backend', l: 'Vancouver BC' },
    { q: 'software developer', l: 'Vancouver BC' },
    { q: 'nestjs developer', l: 'Vancouver BC' },
    { q: 'node.js developer', l: 'Vancouver BC' },
    { q: 'javascript developer', l: 'Vancouver BC' },
    { q: 'web developer', l: 'Vancouver BC' },
    { q: 'backend developer remote', l: '' },
    { q: 'full stack developer remote', l: '' },
    { q: 'software engineer remote', l: '' },
  ];

  private async fetchIndeedRSS(): Promise<Job[]> {
    const jobs: Job[] = [];

    for (const { q, l } of this.indeedQueries) {
      try {
        const params = new URLSearchParams({
          q,
          sort: 'date',
          fromage: '7', // posted in last 7 days
        });
        if (l) params.set('l', l);

        const url = `https://www.indeed.com/rss?${params.toString()}`;
        this.logger.log(`Fetching Indeed RSS: ${url}`);

        const res = await axios.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.indeed.com/',
            'DNT': '1',
          },
        });

        const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false });
        const items = parsed?.rss?.channel?.item;
        if (!items) continue;

        const itemList = Array.isArray(items) ? items : [items];

        for (const item of itemList) {
          const title = item.title || '';
          if (!isSuitableLevel(title)) continue;

          const snippet = (item.description || '').replace(/<[^>]+>/g, '').trim().slice(0, 300);
          const company = item['source'] || extractCompanyFromTitle(title) || 'Unknown';

          jobs.push({
            id: `indeed-${Buffer.from(item.link || title).toString('base64').slice(0, 16)}`,
            title: title.replace(/\s*-\s*.*$/, '').trim(), // strip " - Company Name" suffix
            company,
            location: item['indeed:city'] ? `${item['indeed:city']}, ${item['indeed:state'] || 'BC'}` : (l || 'Remote'),
            source: 'Indeed',
            link: item.link || '',
            snippet,
            tags: extractTags(title + ' ' + snippet),
            posted: item.pubDate || new Date().toISOString(),
          });
        }

        // Be polite to Indeed's servers
        await sleep(1000);
      } catch (err) {
        this.logger.warn(`Indeed RSS fetch failed for "${q}": ${err.message}`);
      }
    }

    return jobs;
  }

  // ─── LinkedIn RSS ─────────────────────────────────────────────────────────
  // LinkedIn's job search page has an undocumented RSS-like feed.
  // f_TPR=r259200 = last 3 days, f_E=2,3 = associate + mid-senior level
  private readonly linkedinQueries = [
    'backend developer typescript',
    'backend engineer',
    'full stack developer',
    'full stack engineer',
    'software engineer',
    'software developer',
    'node.js developer',
    'javascript developer',
    'web developer',
    'nestjs developer',
  ];

  private async fetchLinkedInRSS(): Promise<Job[]> {
    const jobs: Job[] = [];

    for (const keywords of this.linkedinQueries) {
      try {
        const params = new URLSearchParams({
          keywords,
          location: 'Vancouver, British Columbia, Canada',
          f_TPR: 'r604800', // last 7 days
          f_E: '1,2,3',     // entry level (1) + associate (2) + mid-senior (3)
          sortBy: 'DD',
          position: '1',
          pageNum: '0',
        });

        const url = `https://www.linkedin.com/jobs/search?${params.toString()}`;
        this.logger.log(`Fetching LinkedIn: ${keywords}`);

        const res = await axios.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
        });

        // LinkedIn returns full HTML page — parse job cards
        const html: string = res.data;
        const jobMatches = [...html.matchAll(
          /data-entity-urn="urn:li:jobPosting:(\d+)"[\s\S]*?<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>[\s\S]*?<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/gm
        )];

        for (const match of jobMatches) {
          const [, jobId, rawTitle, rawCompany, rawLocation] = match;
          const title = rawTitle.replace(/<[^>]+>/g, '').trim();
          const company = rawCompany.replace(/<[^>]+>/g, '').trim();
          const location = rawLocation.replace(/<[^>]+>/g, '').trim();

          if (!isSuitableLevel(title)) continue;

          jobs.push({
            id: `linkedin-${jobId}`,
            title,
            company,
            location,
            source: 'LinkedIn',
            link: `https://www.linkedin.com/jobs/view/${jobId}`,
            snippet: `${title} at ${company} — ${location}. Apply on LinkedIn.`,
            tags: extractTags(title + ' ' + keywords),
            posted: new Date().toISOString(),
          });
        }

        await sleep(800);
      } catch (err) {
        this.logger.warn(`LinkedIn fetch failed for "${keywords}": ${err.message}`);
      }
    }

    return jobs;
  }

  // ─── Adzuna API ───────────────────────────────────────────────────────────
  // Free tier: 250 calls/month. Sign up at https://developer.adzuna.com
  // Returns real job postings with full descriptions.
  private async fetchAdzuna(): Promise<Job[]> {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;

    if (!appId || appId === 'your_app_id_here') {
      this.logger.warn('Adzuna API keys not set — skipping. Set ADZUNA_APP_ID and ADZUNA_APP_KEY in .env');
      return [];
    }

    const jobs: Job[] = [];
    const queries = [
      'backend developer',
      'backend engineer',
      'full stack developer',
      'full stack engineer',
      'software engineer',
      'software developer',
      'node.js developer',
      'javascript developer',
      'web developer',
    ];

    for (const what of queries) {
      try {
        const url = `https://api.adzuna.com/v1/api/jobs/ca/search/1`;
        const res = await axios.get(url, {
          params: {
            app_id: appId,
            app_key: appKey,
            what,
            where: 'Vancouver',
            max_days_old: 7,
            results_per_page: 20,
          },
          timeout: 10000,
        });

        for (const job of res.data?.results || []) {
          const title = job.title || '';
          if (!isSuitableLevel(title)) continue;

          jobs.push({
            id: `adzuna-${job.id}`,
            title,
            company: job.company?.display_name || 'Unknown',
            location: job.location?.display_name || 'Vancouver, BC',
            source: 'Adzuna',
            link: job.redirect_url || '',
            snippet: (job.description || '').slice(0, 300),
            tags: extractTags(title + ' ' + (job.description || '')),
            posted: job.created || new Date().toISOString(),
          });
        }

        await sleep(300);
      } catch (err) {
        this.logger.warn(`Adzuna fetch failed: ${err.message}`);
      }
    }

    return jobs;
  }

  // ─── Main fetch + cache ───────────────────────────────────────────────────

  async fetchAllJobs(): Promise<Job[]> {
    this.logger.log('Starting job fetch from all sources...');

    const [indeedJobs, linkedinJobs, adzunaJobs] = await Promise.allSettled([
      this.fetchIndeedRSS(),
      this.fetchLinkedInRSS(),
      this.fetchAdzuna(),
    ]);

    const allJobs = [
      ...(indeedJobs.status === 'fulfilled' ? indeedJobs.value : []),
      ...(linkedinJobs.status === 'fulfilled' ? linkedinJobs.value : []),
      ...(adzunaJobs.status === 'fulfilled' ? adzunaJobs.value : []),
    ];

    const deduped = dedupe(allJobs);
    this.logger.log(`Fetched ${deduped.length} unique jobs (${allJobs.length} raw)`);

    return deduped;
  }

  getJobs(): { jobs: Job[]; lastFetched: Date | null; total: number } {
    return {
      jobs: this.cachedJobs,
      lastFetched: this.lastFetched,
      total: this.cachedJobs.length,
    };
  }

  // Run every day at 8am Vancouver time (UTC-7 = 15:00 UTC)
  @Cron('0 15 * * *')
  async scheduledFetch() {
    this.logger.log('Running scheduled daily job fetch...');
    const jobs = await this.fetchAllJobs();

    // Score jobs with the new resume-based scoring service
    this.logger.log('Scoring jobs against resume with Claude Opus 4.5...');
    const scoredJobs = await this.scoringService.scoreJobs(jobs);

    // Cache scored jobs
    this.cachedJobs = scoredJobs;
    this.lastFetched = new Date();

    // Send daily email digest
    this.logger.log('Sending daily email digest...');
    await this.emailService.sendDailyDigest(scoredJobs);

    this.logger.log('Scheduled fetch complete');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function extractCompanyFromTitle(title: string): string {
  // Indeed sometimes puts "Job Title at Company" format
  const match = title.match(/ at (.+)$/i);
  return match ? match[1].trim() : '';
}
