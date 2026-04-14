import * as dotenv from 'dotenv';
dotenv.config();

import { ResumeService } from './src/resume/resume.service';
import { ScoredJob } from './src/scoring/scoring.service';

// Mock job with high score to trigger resume tailoring
const mockJob: ScoredJob = {
  id: 'test-001',
  title: 'Full Stack Developer',
  company: 'Shopify',
  location: 'Vancouver, BC',
  source: 'LinkedIn',
  link: 'https://linkedin.com/jobs/test-001',
  snippet: `We're looking for a Full Stack Developer to join our team. You'll work with React, Next.js, TypeScript on the frontend and Node.js, NestJS, GraphQL on the backend. Experience with PostgreSQL, Redis, and AWS is a plus. You'll be building scalable e-commerce solutions and working on our platform architecture.`,
  tags: ['React', 'Next.js', 'TypeScript', 'Node.js', 'NestJS', 'GraphQL', 'PostgreSQL', 'AWS'],
  posted: new Date().toISOString(),
  score: 85,
  scoreReason: 'Strong match: React, Next.js, TypeScript, NestJS, PostgreSQL skills align perfectly. AWS and architecture experience are relevant.'
};

async function testResumeTailoring() {
  console.log('🧪 Testing Resume Tailoring Workflow\n');
  console.log('Mock Job:', {
    title: mockJob.title,
    company: mockJob.company,
    score: mockJob.score,
  });
  console.log('\n' + '='.repeat(60) + '\n');

  const resumeService = new ResumeService();

  try {
    await resumeService.tailorAndNotify(mockJob);
    console.log('\n✅ Test completed successfully!');
    console.log('Check:');
    console.log('  1. ./resumes/ folder for generated .docx file');
    console.log('  2. Slack channel for notification (if configured)');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
  }
}

testResumeTailoring();
