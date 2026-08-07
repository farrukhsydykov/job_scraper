import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { JobListQueryDto } from '../contracts';
import { Job } from '../database/entities';
import { JobsService, PaginatedJobs } from './jobs.service';

@Controller('jobs')
export class JobsController {
  /**
   * Creates a controller backed by the jobs query service.
   */
  constructor(private readonly jobsService: JobsService) {}

  /**
   * Lists collected jobs with optional dashboard-compatible filters.
   */
  @Get()
  async list(@Query() query: JobListQueryDto): Promise<PaginatedJobs> {
    return this.jobsService.list(query);
  }

  /**
   * Returns the current data for one collected job.
   */
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number): Promise<Job> {
    return this.jobsService.findById(id);
  }
}
