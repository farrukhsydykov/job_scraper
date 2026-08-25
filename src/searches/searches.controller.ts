import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateSavedSearchDto, UpdateSavedSearchDto } from '../contracts';
import { SavedSearch } from '../database/entities';
import { SearchesService } from './searches.service';

@Controller('saved-searches')
export class SearchesController {
  /**
   * Creates a controller backed by the saved-search service.
   */
  constructor(private readonly searchesService: SearchesService) {}

  /**
   * Lists all configured saved searches.
   */
  @Get()
  async list(): Promise<SavedSearch[]> {
    return this.searchesService.list();
  }

  /**
   * Lists archived searches separately from the active search desk.
   */
  @Get('archived')
  async listArchived(): Promise<SavedSearch[]> {
    return this.searchesService.listArchived();
  }

  /**
   * Creates a saved search for a supported source.
   */
  @Post()
  async create(@Body() dto: CreateSavedSearchDto): Promise<SavedSearch> {
    return this.searchesService.create(dto);
  }

  /**
   * Updates one saved search's query or scheduling options.
   */
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSavedSearchDto,
  ): Promise<SavedSearch> {
    return this.searchesService.update(id, dto);
  }

  /**
   * Archives one saved search and pauses future scheduled runs.
   */
  @Post(':id/archive')
  async archive(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SavedSearch> {
    return this.searchesService.archive(id);
  }

  /**
   * Restores one archived search without re-enabling it automatically.
   */
  @Post(':id/restore')
  async restore(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SavedSearch> {
    return this.searchesService.restore(id);
  }

  /**
   * Permanently deletes a search after the archive safeguard has been passed.
   */
  @Delete(':id')
  async deleteArchived(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.searchesService.deleteArchived(id);
  }
}
