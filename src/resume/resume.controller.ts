import { Controller, Get, Put, Body } from '@nestjs/common';
import { ResumeService } from './resume.service';

export interface BaseResume {
  name: string;
  contact: {
    email: string;
    phone: string;
    github: string;
    linkedin: string;
    portfolio: string;
  };
  skills: {
    [category: string]: string;
  };
  certifications?: Array<{
    name: string;
    issueDate: string;
  }>;
  experience: Array<{
    company: string;
    period: string;
    title: string;
    location: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    title: string;
    bullets: string[];
  }>;
  education: Array<{
    school: string;
    degree: string;
    period: string;
  }>;
}

@Controller('resume')
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Get()
  getResume(): BaseResume {
    return this.resumeService.getBaseResume();
  }

  @Put()
  updateResume(@Body() resume: BaseResume): { message: string; resume: BaseResume } {
    this.resumeService.updateBaseResume(resume);
    return {
      message: 'Resume updated successfully',
      resume,
    };
  }
}
