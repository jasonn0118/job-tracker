import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Enable CORS for all origins (adjust if you add a frontend later)
  app.enableCors({
    origin: '*', // Allow all origins, or specify your Railway frontend domain
    methods: ['GET', 'POST'],
  });

  const port = process.env.PORT || 3001;
  // Bind to 0.0.0.0 for Railway (required for external access)
  await app.listen(port, '0.0.0.0');

  logger.log(`Job tracker API running on port ${port}`);
  logger.log('Endpoints:');
  logger.log('  GET  /jobs         — get cached jobs');
  logger.log('  POST /jobs/refresh — fetch fresh jobs from all sources');

  // Skip initial fetch on Railway startup to avoid timeout
  // Cron will run at 8 AM daily, or you can manually trigger POST /jobs/refresh
  if (process.env.NODE_ENV !== 'production') {
    const jobsService = app.get(require('./jobs/jobs.service').JobsService);
    logger.log('Running initial fetch, scoring, and caching...');
    await jobsService.scheduledFetch();
  } else {
    logger.log('Skipping initial fetch in production (cron will run at 8 AM daily)');
  }
}

bootstrap();
