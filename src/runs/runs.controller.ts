import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CollectionRun } from '../database/entities';
import { RunsService } from './runs.service';

@Controller()
export class RunsController {
  /**
   * Creates a controller backed by collection-run orchestration.
   */
  constructor(private readonly runsService: RunsService) {}

  /**
   * Starts a configured saved search immediately.
   */
  @Post('saved-searches/:id/runs')
  async start(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CollectionRun> {
    return this.runsService.start(id);
  }

  /**
   * Lists the most recent collection runs.
   */
  @Get('collection-runs')
  async list(): Promise<CollectionRun[]> {
    return this.runsService.list();
  }

  /**
   * Returns a single collection run and its search configuration.
   */
  @Get('collection-runs/:id')
  async findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CollectionRun> {
    return this.runsService.findById(id);
  }
}
