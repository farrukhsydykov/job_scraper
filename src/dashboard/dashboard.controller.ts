import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Render,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CreateSavedSearchDto, JobListQueryDto } from '../contracts';
import {
  CollectionRunStatus,
  EmploymentType,
  JobSource,
  JobStatus,
  WorkplaceType,
} from '../database/entities';
import { JobsService } from '../jobs/jobs.service';
import { RunsService } from '../runs/runs.service';
import { SearchesService } from '../searches/searches.service';

@Controller()
export class DashboardController {
  /**
   * Creates a dashboard controller backed by the MVP domain services.
   */
  constructor(
    private readonly jobsService: JobsService,
    private readonly searchesService: SearchesService,
    private readonly runsService: RunsService,
  ) {}

  /**
   * Renders the filtered collected-jobs dashboard.
   */
  @Get()
  @Render('jobs')
  async jobs(@Query() query: JobListQueryDto): Promise<object> {
    const page = await this.jobsService.list(query);

    return {
      title: 'Collected jobs',
      page,
      query,
      nextPageUrl: page.nextCursor
        ? `/?${this.toQueryString({ ...query, cursor: page.nextCursor })}`
        : null,
      sources: Object.values(JobSource),
      statuses: Object.values(JobStatus),
      workplaceTypes: Object.values(WorkplaceType),
      employmentTypes: Object.values(EmploymentType),
      formatDate,
    };
  }

  /**
   * Renders the current data for one collected job.
   */
  @Get('dashboard/jobs/:id')
  @Render('job-detail')
  async job(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<object> {
    return {
      title: 'Job detail',
      job: await this.jobsService.findById(id),
      formatDate,
    };
  }

  /**
   * Renders saved searches and the newest source-run outcomes.
   */
  @Get('dashboard/searches')
  @Render('searches')
  async searches(): Promise<object> {
    return {
      title: 'Searches and runs',
      searches: await this.searchesService.list(),
      runs: await this.runsService.list(),
      sources: Object.values(JobSource),
      statuses: Object.values(CollectionRunStatus),
      formatDate,
    };
  }

  /**
   * Creates a saved search from the lightweight dashboard form.
   */
  @Post('dashboard/searches')
  async createSearch(
    @Body() dto: CreateSavedSearchDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.searchesService.create(dto);
    response.redirect('/dashboard/searches');
  }

  /**
   * Toggles whether a saved search can be scheduled or run manually.
   */
  @Post('dashboard/searches/:id/toggle')
  async toggleSearch(
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ): Promise<void> {
    const search = await this.searchesService.findById(id);
    await this.searchesService.update(id, { enabled: !search.enabled });
    response.redirect('/dashboard/searches');
  }

  /**
   * Runs one saved search immediately before returning to the dashboard.
   */
  @Post('dashboard/searches/:id/runs')
  async runSearch(
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ): Promise<void> {
    await this.runsService.start(id);
    response.redirect('/dashboard/searches');
  }

  /**
   * Produces a query string without empty dashboard filter values.
   */
  private toQueryString(values: Record<string, unknown>): string {
    const parameters = new URLSearchParams();

    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== null && value !== '') {
        parameters.set(key, String(value));
      }
    }

    return parameters.toString();
  }
}

/**
 * Formats a nullable source timestamp for dashboard rendering.
 */
const formatDate = (value: Date | null): string =>
  value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(value) : '—';
