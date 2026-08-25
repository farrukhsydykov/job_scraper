import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateSavedSearchDto, JobListQueryDto } from './contracts';

describe('saved-search DTOs', () => {
  it('trims text and preserves a false enabled value from form input', async () => {
    const dto = plainToInstance(CreateSavedSearchDto, {
      source: 'linkedin',
      keyword: '  backend engineer  ',
      location: '  Berlin  ',
      enabled: 'false',
      resultLimit: '25',
      runWindowMinutes: '4',
      requestDelaySeconds: '60',
      requestJitterSeconds: '17',
    });

    expect(dto.keyword).toBe('backend engineer');
    expect(dto.location).toBe('Berlin');
    expect(dto.enabled).toBe(false);
    expect(dto.resultLimit).toBe(25);
    expect(dto.runWindowMinutes).toBe(4);
    expect(dto.requestDelaySeconds).toBe(60);
    expect(dto.requestJitterSeconds).toBe(17);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects keywords that contain only whitespace', async () => {
    const dto = plainToInstance(CreateSavedSearchDto, {
      source: 'linkedin',
      keyword: '   ',
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'keyword' }),
      ]),
    );
  });

  it('ignores empty optional job-list query values from HTML forms', async () => {
    const dto = plainToInstance(JobListQueryDto, {
      q: 'Platform',
      source: '',
      status: '',
      location: '',
      workplaceType: '',
      employmentType: '',
      publishedAfter: '',
      limit: '',
      cursor: '',
      page: '3',
    });

    expect(dto.source).toBeUndefined();
    expect(dto.status).toBeUndefined();
    expect(dto.location).toBeUndefined();
    expect(dto.limit).toBeUndefined();
    expect(dto.page).toBe(3);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
