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
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { getCollectionEnv } from '../config/collection-env';
import {
  CreateSavedSearchDto,
  JobListQueryDto,
  UpdateSavedSearchDto,
} from '../contracts';
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
    private readonly config: ConfigService,
  ) {}

  /**
   * Renders the filtered collected-jobs dashboard.
   */
  @Get()
  @Render('jobs')
  async jobs(@Query() query: JobListQueryDto): Promise<object> {
    const pageQuery: JobListQueryDto = {
      ...query,
      page: query.page ?? 1,
      cursor: undefined,
    };
    const page = await this.jobsService.list(pageQuery);
    const currentPage = page.currentPage ?? 1;
    const pageLinks = getPageNumbers(currentPage, page.totalPages).map(
      (pageNumber) => ({
        number: pageNumber,
        url: `/?${this.toQueryString({
          ...pageQuery,
          page: pageNumber,
        })}`,
      }),
    );

    return {
      title: 'Collected jobs',
      page,
      query: pageQuery,
      currentPage,
      pageLinks,
      previousPageUrl:
        currentPage > 1
          ? `/?${this.toQueryString({
              ...pageQuery,
              page: currentPage - 1,
            })}`
          : null,
      nextPageUrl:
        currentPage < page.totalPages
          ? `/?${this.toQueryString({
              ...pageQuery,
              page: currentPage + 1,
            })}`
          : null,
      sources: Object.values(JobSource),
      statuses: Object.values(JobStatus),
      workplaceTypes: Object.values(WorkplaceType),
      employmentTypes: Object.values(EmploymentType),
      collection: getCollectionEnv(this.config),
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
      searches: await this.searchesService.listActive(),
      archivedSearches: await this.searchesService.listArchived(),
      runs: await this.runsService.list(),
      sources: Object.values(JobSource),
      statuses: Object.values(CollectionRunStatus),
      collection: getCollectionEnv(this.config),
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
   * Updates a saved search from its server-rendered control card.
   */
  @Post('dashboard/searches/:id')
  async updateSearch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSavedSearchDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.searchesService.update(id, dto);
    response.redirect('/dashboard/searches');
  }

  /**
   * Archives a saved search from the dashboard and pauses future runs.
   */
  @Post('dashboard/searches/:id/archive')
  async archiveSearch(
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ): Promise<void> {
    await this.searchesService.archive(id);
    response.redirect('/dashboard/searches');
  }

  /**
   * Restores an archived search to the dashboard without enabling it.
   */
  @Post('dashboard/searches/:id/restore')
  async restoreSearch(
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ): Promise<void> {
    await this.searchesService.restore(id);
    response.redirect('/dashboard/searches');
  }

  /**
   * Permanently deletes an archived search from the dashboard.
   */
  @Post('dashboard/searches/:id/delete')
  async deleteArchivedSearch(
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ): Promise<void> {
    await this.searchesService.deleteArchived(id);
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

/**
 * Returns a compact page-number window around the current page.
 */
const getPageNumbers = (currentPage: number, totalPages: number): number[] => {
  if (!totalPages) {
    return [];
  }

  const firstPage = Math.max(1, currentPage - 2);
  const lastPage = Math.min(totalPages, currentPage + 2);

  return Array.from(
    { length: lastPage - firstPage + 1 },
    (_, index) => firstPage + index,
  );
};
