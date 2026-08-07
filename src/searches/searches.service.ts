import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSavedSearchDto, UpdateSavedSearchDto } from '../contracts';
import { SavedSearch } from '../database/entities';

/**
 * Manages the saved searches that define collection work.
 */
@Injectable()
export class SearchesService {
  /**
   * Creates a saved-search service using its database repository.
   */
  constructor(
    @InjectRepository(SavedSearch)
    private readonly savedSearches: Repository<SavedSearch>,
  ) {}

  /**
   * Lists saved searches with newest records first.
   */
  async list(): Promise<SavedSearch[]> {
    return this.savedSearches.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Creates an enabled or disabled source search.
   */
  async create(dto: CreateSavedSearchDto): Promise<SavedSearch> {
    return this.savedSearches.save(
      this.savedSearches.create({
        source: dto.source,
        keyword: dto.keyword.trim(),
        location: dto.location?.trim() || null,
        filters: dto.filters ?? {},
        enabled: dto.enabled ?? true,
        scheduleMinutes: dto.scheduleMinutes ?? 360,
      }),
    );
  }

  /**
   * Applies a partial update to one saved search.
   */
  async update(
    id: number,
    dto: UpdateSavedSearchDto,
  ): Promise<SavedSearch> {
    const savedSearch = await this.findById(id);

    if (dto.keyword !== undefined) {
      savedSearch.keyword = dto.keyword.trim();
    }
    if (dto.location !== undefined) {
      savedSearch.location = dto.location?.trim() || null;
    }
    if (dto.filters !== undefined) {
      savedSearch.filters = dto.filters;
    }
    if (dto.enabled !== undefined) {
      savedSearch.enabled = dto.enabled;
    }
    if (dto.scheduleMinutes !== undefined) {
      savedSearch.scheduleMinutes = dto.scheduleMinutes;
    }

    return this.savedSearches.save(savedSearch);
  }

  /**
   * Returns one saved search or a 404 response.
   */
  async findById(id: number): Promise<SavedSearch> {
    const savedSearch = await this.savedSearches.findOneBy({ id });
    if (!savedSearch) {
      throw new NotFoundException(`Saved search ${id} was not found.`);
    }

    return savedSearch;
  }

  /**
   * Finds enabled searches whose configured interval has elapsed.
   */
  async findDue(now = new Date()): Promise<SavedSearch[]> {
    const enabledSearches = await this.savedSearches.findBy({
      enabled: true,
    });

    return enabledSearches.filter((search) => {
      if (!search.lastAttemptedAt) {
        return true;
      }

      const nextRunAt =
        search.lastAttemptedAt.getTime() +
        search.scheduleMinutes * 60 * 1_000;
      return nextRunAt <= now.getTime();
    });
  }

  /**
   * Records a run attempt and only advances completion after full coverage.
   */
  async recordRunAttempt(
    savedSearch: SavedSearch,
    finishedAt: Date,
    completed: boolean,
  ): Promise<SavedSearch> {
    savedSearch.lastAttemptedAt = finishedAt;
    if (completed) {
      savedSearch.lastCompletedAt = finishedAt;
    }

    return this.savedSearches.save(savedSearch);
  }
}
