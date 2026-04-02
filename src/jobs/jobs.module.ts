import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { ScoringModule } from '../scoring/scoring.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [ScoringModule, EmailModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
