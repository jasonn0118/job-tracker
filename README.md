# Job Tracker Backend

AI-powered job tracker backend that aggregates tech jobs from multiple sources, scores them against your resume using Claude Opus 4.5, and sends daily email digests with top matches.

## Features

- **Multi-Source Aggregation**: Fetches jobs from LinkedIn, Indeed, and Adzuna
- **Resume-Based AI Scoring**: Uses Claude Opus 4.5 to score job relevance (0-100) against your resume
- **Daily Email Digest**: Automatically emails top-scoring jobs (75+) every morning
- **Prompt Caching**: 90% cost reduction on repeated API calls
- **Smart Filtering**:
  - Automatically filters out senior/lead/intern positions
  - Batched scoring (one API call for all jobs)
  - Deduplicates based on title + company
- **Auto-Tagging**: Detects and tags jobs with relevant technologies
- **Daily Automation**: Cron job runs at 8 AM Vancouver time
- **RESTful API**: Simple endpoints to get jobs and refresh data
- **Railway-Ready**: Configured for free Railway deployment

## Tech Stack

- **Framework**: NestJS with TypeScript
- **AI**: Anthropic Claude Opus 4.5 with prompt caching
- **Email**: Nodemailer with Gmail SMTP
- **Job Sources**:
  - LinkedIn (HTML scraping)
  - Adzuna API (free tier)
  - Indeed RSS (currently blocked)
- **Scheduling**: @nestjs/schedule with cron
- **Deployment**: Railway (free tier)
- **HTTP Client**: Axios
- **XML Parsing**: xml2js

## Setup

### Prerequisites

- Node.js 18+ and npm
- Anthropic API key ([get one here](https://console.anthropic.com/))
- Adzuna API credentials ([sign up here](https://developer.adzuna.com))
- Gmail account with App Password ([generate here](https://myaccount.google.com/apppasswords))

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd job-tracker-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```bash
# Adzuna API — free tier, sign up at https://developer.adzuna.com
ADZUNA_APP_ID=your_app_id_here
ADZUNA_APP_KEY=your_app_key_here

# Anthropic — for AI scoring
ANTHROPIC_API_KEY=your_anthropic_key_here

# Gmail SMTP for daily digest emails
# IMPORTANT: Use a 16-character Google App Password, NOT your regular Gmail password
# Generate one at: https://myaccount.google.com/apppasswords
GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
DIGEST_TO_EMAIL=your@gmail.com

# Server
PORT=3001
```

4. Start the development server:
```bash
npm run start:dev
```

The API will be available at `http://localhost:3001`

## API Endpoints

### GET /
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "message": "Job Tracker Backend is running",
  "timestamp": "2026-03-27T03:14:18.454Z"
}
```

### GET /health
Detailed health status with uptime.

**Response:**
```json
{
  "status": "ok",
  "uptime": 3600.5,
  "timestamp": "2026-03-27T03:14:18.454Z"
}
```

### GET /jobs
Get cached, scored, and filtered jobs.

**Response:**
```json
{
  "jobs": [
    {
      "id": "linkedin-1234567890",
      "title": "Backend Engineer",
      "company": "LayerZero Labs",
      "location": "Vancouver, British Columbia, Canada",
      "source": "LinkedIn",
      "link": "https://www.linkedin.com/jobs/view/1234567890",
      "snippet": "Backend Engineer at LayerZero Labs — Vancouver...",
      "tags": ["TypeScript", "Node.js", "PostgreSQL"],
      "posted": "2026-03-26T20:00:00.000Z",
      "score": 85,
      "scoreReason": "Strong NestJS + TypeScript backend match in Vancouver, intermediate level"
    }
  ],
  "lastFetched": "2026-03-27T03:14:18.454Z",
  "total": 17
}
```

### POST /jobs/refresh
Manually trigger a fresh job fetch, AI scoring, and email digest.

**Response:**
```json
{
  "success": true,
  "total": 17
}
```

## How It Works

### 1. Job Aggregation
The service fetches jobs from multiple sources:
- **LinkedIn**: Scrapes job search HTML for Vancouver BC area
- **Adzuna**: Uses free API tier (250 calls/month)
- **Indeed**: RSS feed (currently blocked by bot detection)

### 2. Initial Filtering
Before AI scoring, jobs are filtered to remove:
- Senior/lead positions (senior, sr., lead, principal, staff, director, manager, etc.)
- Internships and new grad roles
- Duplicates (based on title + company)

### 3. Resume-Based AI Scoring
**ONE batched API call** to Claude Opus 4.5 with:
- Your complete resume (Jeamin Shin - 4 years experience, NestJS, React, Next.js, TypeScript, AWS)
- Scoring rubric (80-100: strong match, 60-79: related, 40-59: adjacent, <40: wrong level)
- Automatic penalties for senior/lead (-30 points) or junior roles (-20 points)
- **Prompt caching**: Resume + rubric cached for 90% cost reduction on subsequent calls

Scores each job (0-100) with reasoning:
```json
{
  "score": 85,
  "reason": "Strong NestJS + TypeScript backend match in Vancouver, intermediate level"
}
```

### 4. Email Digest
Filters jobs with score ≥75 and sends beautiful HTML email with:
- Job title, company, location
- Color-coded score badge
- AI reasoning for the match
- "Apply Now" button linking to job posting
- Falls back to "No strong matches today" if no jobs score 75+

### 5. Caching & API
- Scored jobs cached in memory for fast API responses
- `/jobs` endpoint returns cached data (<50ms)
- `/jobs/refresh` triggers fresh fetch + scoring + email

### 6. Daily Automation
Cron job runs at **8:00 AM Vancouver time (15:00 UTC)** daily:
1. Fetches jobs from all sources
2. Scores with Claude Opus 4.5 (batched)
3. Sends email digest to your inbox
4. Caches results for API

## Project Structure

```
src/
├── jobs/
│   ├── jobs.controller.ts    # API endpoints (/jobs, /jobs/refresh)
│   ├── jobs.service.ts        # Job fetching from LinkedIn, Adzuna, Indeed
│   └── jobs.module.ts         # Module configuration
├── scoring/
│   ├── scoring.service.ts    # Resume-based AI scoring with Claude Opus 4.5
│   └── scoring.module.ts     # Scoring module
├── email/
│   ├── email.service.ts      # Daily digest email with Gmail SMTP
│   └── email.module.ts       # Email module
├── health.controller.ts      # Health check endpoints (/, /health)
├── app.module.ts             # Root module
└── main.ts                   # Bootstrap file
```

## Configuration

### Customizing Your Resume

Edit the resume in `src/scoring/scoring.service.ts` (lines 15-25) to match your profile:

```typescript
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
```

### Adjusting Email Threshold

Change the email digest threshold in `src/email/email.service.ts` (line 14):

```typescript
const topJobs = scoredJobs
  .filter(job => job.score >= 75) // Change 75 to your preferred threshold
  .sort((a, b) => b.score - a.score);
```

### Modifying Search Queries

Update the search queries in `src/jobs/jobs.service.ts`:
- LinkedIn queries: lines 155-166
- Adzuna queries: lines 244-254

## Performance

- **Job fetch**: ~13 seconds (LinkedIn + Adzuna)
- **AI scoring**: ~3 seconds total (batched, with prompt caching)
- **Email sending**: ~1 second
- **Total daily run**: ~20 seconds
- **API response**: <50ms (cached data)
- **Cost optimization**: 90% reduction via prompt caching

## Typical Results

From a daily run:
- **~70 jobs fetched** (170+ raw before deduplication)
- **~15-20 jobs scored 40+** (AI filtering)
- **~3-5 jobs emailed** (score ≥75)
- **Score distribution**: 40-95 (higher scores = better resume match)

Example high-scoring job:
```json
{
  "score": 92,
  "reason": "Perfect NestJS + TypeScript backend role in Vancouver, intermediate level, exact tech stack match"
}
```

## Deployment

### Railway (Recommended - Free Tier)

Complete deployment guide available in `DEPLOYMENT.md`.

Quick steps:
1. Push code to GitHub
2. Create Railway project from GitHub repo
3. Add environment variables in Railway dashboard
4. Railway auto-deploys and provides public URL

Your app will run 24/7 on Railway's free tier (~$3-4/month usage, $5 credit included).

**Cost breakdown:**
- Railway: ~$3.50/month (within $5 free tier)
- Claude API: ~$1-2/month (with prompt caching)
- Total: **~$4.50/month**

### Manual Deployment

```bash
# Build
npm run build

# Start production server
npm start
```

Set `NODE_ENV=production` to skip initial fetch on startup.

## Testing

Test the daily workflow manually:

```bash
# Trigger fetch + scoring + email
curl -X POST http://localhost:3001/jobs/refresh

# Check your email inbox for digest
# Check logs for scoring details
```

You should receive an email digest within ~30 seconds showing top-scoring jobs.

## Future Improvements

- [ ] Add more job sources (Glassdoor, remote job boards, WorkBC)
- [ ] Implement database for job history and trends
- [ ] Track which jobs you've applied to
- [ ] Weekly summary email with application stats
- [ ] Slack/Discord integration for instant alerts on 90+ scores
- [ ] A/B test different resume variations to optimize scores

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
