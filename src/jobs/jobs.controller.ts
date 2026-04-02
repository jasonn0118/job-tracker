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

  // POST /jobs/refresh — triggers a fresh fetch from all sources (slow, ~5-10s)
  @Post('refresh')
  async refresh() {
    this.logger.log('Manual refresh triggered');
    const jobs = await this.jobsService.fetchAllJobs();
    return { success: true, total: jobs.length };
  }
}
