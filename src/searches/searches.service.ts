import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { CreateSavedSearchDto, UpdateSavedSearchDto } from '../contracts';
import {
  validateSavedSearchFilters,
  validateSourceResultLimit,
} from '../collectors/apify-inputs';
import { JobSource, SavedSearch } from '../database/entities';

const DEFAULT_RESULT_LIMIT = 10;
const DEFAULT_RUN_WINDOW_MINUTES = 5;
const DEFAULT_REQUEST_DELAY_SECONDS = 0;
const DEFAULT_REQUEST_JITTER_SECONDS = 0;
const MAX_REQUEST_DELAY_SECONDS = 300;
const MAX_REQUEST_JITTER_SECONDS = 300;

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
   * Lists only searches that are available on the active search desk.
   */
  async listActive(): Promise<SavedSearch[]> {
    return this.savedSearches.find({
      where: { archivedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Lists archived searches for restore or permanent deletion.
   */
  async listArchived(): Promise<SavedSearch[]> {
    return this.savedSearches.find({
      where: { archivedAt: Not(IsNull()) },
      order: { archivedAt: 'DESC' },
    });
  }

  /**
   * Creates an enabled or disabled source search.
   */
  async create(dto: CreateSavedSearchDto): Promise<SavedSearch> {
    validateSavedSearchFilters(dto.source, dto.filters ?? {});
    const keyword = dto.keyword.trim();
    if (!keyword) {
      throw new BadRequestException('A saved search keyword is required.');
    }
    const resultLimit = dto.resultLimit ?? DEFAULT_RESULT_LIMIT;
    const runWindowMinutes =
      dto.runWindowMinutes ?? DEFAULT_RUN_WINDOW_MINUTES;
    const requestDelaySeconds =
      dto.requestDelaySeconds ?? DEFAULT_REQUEST_DELAY_SECONDS;
    const requestJitterSeconds =
      dto.requestJitterSeconds ?? DEFAULT_REQUEST_JITTER_SECONDS;
    this.validateRunSettings(
      dto.source,
      dto.scheduleMinutes ?? 360,
      resultLimit,
      runWindowMinutes,
      requestDelaySeconds,
      requestJitterSeconds,
    );

    return this.savedSearches.save(
      this.savedSearches.create({
        source: dto.source,
        keyword,
        location: dto.location?.trim() || null,
        filters: dto.filters ?? {},
        enabled: dto.enabled ?? true,
        scheduleMinutes: dto.scheduleMinutes ?? 360,
        resultLimit,
        runWindowMinutes,
        requestDelaySeconds,
        requestJitterSeconds,
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
    const source = dto.source ?? savedSearch.source;
    const sourceChanged = source !== savedSearch.source;
    const filters = dto.filters ?? (sourceChanged ? {} : savedSearch.filters);

    validateSavedSearchFilters(source, filters);
    if (dto.keyword !== undefined) {
      const keyword = dto.keyword.trim();
      if (!keyword) {
        throw new BadRequestException('A saved search keyword is required.');
      }
      savedSearch.keyword = keyword;
    }
    if (dto.location !== undefined) {
      savedSearch.location = dto.location?.trim() || null;
    }
    if (sourceChanged) {
      savedSearch.source = source;
      savedSearch.filters = filters;
    } else if (dto.filters !== undefined) {
      savedSearch.filters = dto.filters;
    }
    if (dto.enabled !== undefined) {
      savedSearch.enabled = dto.enabled;
    }
    if (dto.scheduleMinutes !== undefined) {
      savedSearch.scheduleMinutes = dto.scheduleMinutes;
    }
    if (dto.resultLimit !== undefined) {
      savedSearch.resultLimit = dto.resultLimit;
    }
    if (dto.runWindowMinutes !== undefined) {
      savedSearch.runWindowMinutes = dto.runWindowMinutes;
    }
    if (dto.requestDelaySeconds !== undefined) {
      savedSearch.requestDelaySeconds = dto.requestDelaySeconds;
    }
    if (dto.requestJitterSeconds !== undefined) {
      savedSearch.requestJitterSeconds = dto.requestJitterSeconds;
    }
    this.validateRunSettings(
      savedSearch.source,
      savedSearch.scheduleMinutes,
      savedSearch.resultLimit,
      savedSearch.runWindowMinutes,
      savedSearch.requestDelaySeconds,
      savedSearch.requestJitterSeconds,
    );

    return this.savedSearches.save(savedSearch);
  }

  /**
   * Archives a search and pauses it so the scheduler cannot start new runs.
   */
  async archive(id: number): Promise<SavedSearch> {
    const savedSearch = await this.findById(id);
    if (savedSearch.archivedAt) {
      return savedSearch;
    }

    savedSearch.archivedAt = new Date();
    savedSearch.enabled = false;
    return this.savedSearches.save(savedSearch);
  }

  /**
   * Restores a search to the active desk while keeping it paused by default.
   */
  async restore(id: number): Promise<SavedSearch> {
    const savedSearch = await this.findById(id);
    if (!savedSearch.archivedAt) {
      return savedSearch;
    }

    savedSearch.archivedAt = null;
    savedSearch.enabled = false;
    return this.savedSearches.save(savedSearch);
  }

  /**
   * Permanently deletes a search only after it has been archived.
   */
  async deleteArchived(id: number): Promise<void> {
    const savedSearch = await this.findById(id);
    if (!savedSearch.archivedAt) {
      throw new BadRequestException(
        'Archive the saved search before deleting it permanently.',
      );
    }

    await this.savedSearches.remove(savedSearch);
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
      archivedAt: IsNull(),
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

  /**
   * Rejects unsafe scheduling, result, and pacing values before persistence.
   */
  private validateRunSettings(
    source: JobSource,
    scheduleMinutes: number,
    resultLimit: number,
    runWindowMinutes: number,
    requestDelaySeconds: number,
    requestJitterSeconds: number,
  ): void {
    if (!Number.isInteger(scheduleMinutes) || scheduleMinutes < 15 || scheduleMinutes > 1440) {
      throw new BadRequestException(
        'Schedule interval must be an integer from 15 to 1440 minutes.',
      );
    }
    try {
      validateSourceResultLimit(source, resultLimit);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'The result limit is invalid.',
      );
    }
    if (
      !Number.isInteger(runWindowMinutes) ||
      runWindowMinutes < 1 ||
      runWindowMinutes > 15
    ) {
      throw new BadRequestException(
        'Run window must be an integer from 1 to 15 minutes.',
      );
    }
    if (
      !Number.isInteger(requestDelaySeconds) ||
      requestDelaySeconds < 0 ||
      requestDelaySeconds > MAX_REQUEST_DELAY_SECONDS
    ) {
      throw new BadRequestException(
        'Request delay must be an integer from 0 to 300 seconds.',
      );
    }
    if (
      !Number.isInteger(requestJitterSeconds) ||
      requestJitterSeconds < 0 ||
      requestJitterSeconds > MAX_REQUEST_JITTER_SECONDS ||
      requestJitterSeconds > requestDelaySeconds ||
      requestDelaySeconds + requestJitterSeconds > 600
    ) {
      throw new BadRequestException(
        'Request jitter must be no greater than the delay and keep the effective delay bounded.',
      );
    }
  }
}
