# Job Tracker Backend

AI-powered job tracker backend that aggregates tech jobs from multiple sources and uses Claude AI to intelligently score and filter opportunities.

## Features

- **Multi-Source Aggregation**: Fetches jobs from LinkedIn, Indeed, and Adzuna
- **AI-Powered Scoring**: Uses Claude Sonnet 4 to score job relevance (0-100) based on your profile
- **Smart Filtering**:
  - Automatically filters out senior/lead/intern positions
  - Removes low-scoring jobs (score <40)
  - Deduplicates based on title + company
- **Auto-Tagging**: Detects and tags jobs with relevant technologies (TypeScript, React, Node.js, etc.)
- **Daily Automation**: Scheduled cron job fetches fresh jobs every day
- **RESTful API**: Simple endpoints to get jobs and refresh data

## Tech Stack

- **Framework**: NestJS with TypeScript
- **AI**: Anthropic Claude Sonnet 4.6
- **Job Sources**:
  - LinkedIn (HTML scraping)
  - Adzuna API (free tier)
  - Indeed RSS (currently blocked)
- **Scheduling**: @nestjs/schedule with cron
- **HTTP Client**: Axios
- **XML Parsing**: xml2js

## Setup

### Prerequisites

- Node.js 16+ and npm
- Anthropic API key ([get one here](https://console.anthropic.com/))
- Adzuna API credentials ([sign up here](https://developer.adzuna.com))

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

# Server
PORT=3001
```

4. Start the development server:
```bash
npm run start:dev
```

The API will be available at `http://localhost:3001`

## API Endpoints

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
      "score": 72,
      "scoreReason": "Strong match on location (Vancouver) and role type..."
    }
  ],
  "lastFetched": "2026-03-27T03:14:18.454Z",
  "total": 17
}
```

### POST /jobs/refresh
Manually trigger a fresh job fetch and rescore.

**Response:**
```json
{
  "message": "Successfully fetched and scored 17 jobs",
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

### 3. AI Scoring
Each job is scored by Claude AI (0-100) based on:
- **Role Type**: Backend/full-stack preferred over pure frontend
- **Tech Stack**: TypeScript, Node.js, NestJS, React, Next.js, GraphQL, PostgreSQL, AWS, Docker
- **Experience Level**: Junior to mid-level (no explicit senior/lead mentions)
- **Location**: Vancouver BC or remote
- **Job Focus**: Hands-on coding over management

### 4. Final Filtering
- Only jobs with score ≥40 are kept
- Results sorted by score (highest first)
- Cached for quick retrieval

### 5. Automation
A cron job runs daily at 8:00 AM Vancouver time (15:00 UTC) to automatically refresh jobs.

## Project Structure

```
src/
├── jobs/
│   ├── jobs.controller.ts    # API endpoints
│   ├── jobs.service.ts        # Core logic (fetching, scoring, filtering)
│   └── jobs.module.ts         # Module configuration
├── app.module.ts              # Root module
└── main.ts                    # Bootstrap file
```

## Configuration

### Customizing the Target Profile

Edit the Claude AI prompt in `jobs.service.ts` (line 301-336) to match your profile:

```typescript
const prompt = `You are a job matching expert. Score this job posting from 0-100 based on how well it fits this profile:

Target Profile:
- Backend or Full-stack TypeScript developer
- Junior to Mid-level experience (avoiding senior/lead roles)
- Key skills: TypeScript, Node.js, NestJS, React, Next.js, GraphQL, PostgreSQL, AWS, Docker
- Location: Vancouver BC or Remote
- Seeking hands-on coding roles (not management)
...
```

### Adjusting Score Threshold

Change the minimum score in `jobs.service.ts` (line 404):

```typescript
.filter(j => j.score >= 40) // Change 40 to your preferred threshold
```

### Modifying Search Queries

Update the search queries in `jobs.service.ts`:
- LinkedIn queries: lines 155-166
- Adzuna queries: lines 244-254

## Performance

- **Initial fetch**: ~13 seconds (LinkedIn + Adzuna)
- **AI scoring**: ~3-4 seconds per job (~4.5 minutes for 71 jobs)
- **Total startup time**: ~5 minutes for full pipeline
- **API response time**: <50ms (cached data)

## Results

From a typical run:
- **71 jobs fetched** (171 raw before deduplication)
- **17 jobs kept** after AI scoring (76% filtered out)
- **Score range**: 42-72 (out of 100)

## Future Improvements

- [ ] Add more job sources (Glassdoor, remote job boards)
- [ ] Implement database for persistent storage
- [ ] Add user authentication and custom profiles
- [ ] Build frontend dashboard
- [ ] Add email/webhook notifications for new high-scoring jobs
- [ ] Implement job application tracking
- [ ] Add analytics and insights

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
