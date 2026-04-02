import { Controller, Get, Post, Logger } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(private readonly jobsService: JobsService) {}

  // GET /jobs — returns cached jobs (fast)
  @Get()
  getJobs() {
    return this.jobsService.getJobs();
  }

  // POST /jobs/refresh — triggers a fresh fetch, scoring, and email (slow, ~20-30s)
  @Post('refresh')
  async refresh() {
    this.logger.log('Manual refresh triggered');
    await this.jobsService.scheduledFetch();
    const result = this.jobsService.getJobs();
    return { success: true, total: result.total, message: 'Jobs fetched, scored, and emailed' };
  }
}
