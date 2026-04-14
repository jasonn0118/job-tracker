import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { ScoringModule } from '../scoring/scoring.module';
import { EmailModule } from '../email/email.module';
import { ResumeModule } from '../resume/resume.module';

@Module({
  imports: [ScoringModule, EmailModule, ResumeModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
