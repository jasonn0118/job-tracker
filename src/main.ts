import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Allow your frontend (localhost:3000 or your deployed domain) to call this API
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://your-frontend-domain.com', // replace with your actual domain
    ],
    methods: ['GET', 'POST'],
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`Job tracker API running on http://localhost:${port}`);
  logger.log('Endpoints:');
  logger.log('  GET  /jobs         — get cached jobs');
  logger.log('  POST /jobs/refresh — fetch fresh jobs from all sources');

  // Fetch jobs on startup so cache is populated immediately
  const jobsService = app.get(require('./jobs/jobs.service').JobsService);
  logger.log('Fetching initial jobs on startup...');
  await jobsService.fetchAllJobs();
}

bootstrap();
