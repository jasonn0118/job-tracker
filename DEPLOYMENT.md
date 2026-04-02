# Railway Deployment Guide

## Prerequisites
- Railway account (free tier available)
- GitHub account (to connect your repo)

## Deployment Steps

### 1. Push Code to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Create Railway Project
1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Authorize Railway to access your GitHub
5. Select your `job-tracker-backend` repository

### 3. Configure Environment Variables
In Railway dashboard, go to Variables tab and add:

```bash
# Required Variables
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
ADZUNA_APP_ID=your_app_id_here
ADZUNA_APP_KEY=your_app_key_here
GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
DIGEST_TO_EMAIL=your@gmail.com

# Railway auto-provides PORT
# Set NODE_ENV for production behavior
NODE_ENV=production
```

### 4. Deploy
Railway will automatically:
- Install dependencies
- Build TypeScript (`npm run build`)
- Start the app (`npm start`)
- Assign a public URL (e.g., `https://your-app.up.railway.app`)

### 5. Verify Deployment
Visit your Railway URL:
- `GET /` - Health check
- `GET /health` - Detailed health status
- `GET /jobs` - Get cached jobs
- `POST /jobs/refresh` - Trigger manual fetch

### 6. Monitor Logs
- Check Railway dashboard Logs tab
- Look for: "Job tracker API running on port XXXX"
- Cron will run daily at 8 AM Vancouver time (15:00 UTC)

## Testing the Deployed API

```bash
# Get your Railway URL from dashboard
export API_URL="https://your-app.up.railway.app"

# Health check
curl $API_URL/health

# Get jobs
curl $API_URL/jobs

# Trigger refresh (this will also send test email)
curl -X POST $API_URL/jobs/refresh
```

## Cron Schedule
The daily job fetch runs at:
- **8:00 AM Vancouver time (UTC-7)**
- **Cron expression: `0 15 * * *`** (15:00 UTC)
- Automatically fetches, scores, and emails top matches

## Free Tier Limits
Railway free tier includes:
- $5 credit per month
- Enough for 24/7 backend + daily API calls
- Your app should cost ~$3-4/month

## Troubleshooting

### App crashes on startup
- Check Railway logs for errors
- Verify all environment variables are set
- Check Node version matches (`engines` in package.json)

### Cron not running
- Ensure Railway app is active (not sleeping)
- Check logs at 8 AM Vancouver time
- Verify timezone calculations

### Email not sending
- Confirm Gmail App Password is correct (16 chars, no spaces)
- Check Gmail "Less secure apps" is enabled
- Review logs for email service errors

### API not accessible
- Check Railway assigned public domain
- Verify app is running (not crashed)
- Test health endpoint first: `curl <url>/health`

## Cost Optimization
- Prompt caching reduces Claude API costs by 90% on repeated resume
- Batched scoring (one API call for all jobs)
- Railway free tier covers typical usage

## Manual Trigger
To test without waiting for cron:
```bash
curl -X POST https://your-app.up.railway.app/jobs/refresh
```

This will:
1. Fetch jobs from LinkedIn, Adzuna
2. Score with Claude Opus 4.5
3. Send test email immediately
