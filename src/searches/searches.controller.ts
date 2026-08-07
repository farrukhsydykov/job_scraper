import {
  Body,
  Controller,
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
}
