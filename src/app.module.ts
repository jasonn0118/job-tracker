import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { JobsModule } from './jobs/jobs.module';
import { ScoringModule } from './scoring/scoring.module';
import { EmailModule } from './email/email.module';
import { ResumeModule } from './resume/resume.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ScoringModule,
    EmailModule,
    ResumeModule,
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
