import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ready only when PostgreSQL accepts a query', async () => {
    const dataSource = { query: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const controller = new HealthController(dataSource as never);

    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns a safe 503 response when PostgreSQL is unavailable', async () => {
    const dataSource = { query: vi.fn().mockRejectedValue(new Error('connection failed')) };
    const controller = new HealthController(dataSource as never);

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
