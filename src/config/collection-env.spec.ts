import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { JobSource } from '../database/entities';
import {
  getCollectionEnv,
  isSourceCollectionEnabled,
} from './collection-env';

/**
 * Builds a ConfigService-like object from environment values.
 */
const createConfig = (values: Record<string, string>): ConfigService =>
  ({
    get: (key: string, defaultValue?: string) => values[key] ?? defaultValue,
  }) as ConfigService;

describe('collection env', () => {
  it('enables a source only when both flags are the string true', () => {
    const config = createConfig({
      COLLECTION_ENABLED: 'true',
      APIFY_LINKEDIN_ENABLED: 'true',
      APIFY_XING_ENABLED: 'false',
    });

    expect(isSourceCollectionEnabled(config, JobSource.LINKEDIN)).toBe(true);
    expect(isSourceCollectionEnabled(config, JobSource.XING)).toBe(false);
  });

  it('exposes dashboard flags from the environment', () => {
    expect(
      getCollectionEnv(
        createConfig({
          COLLECTION_ENABLED: 'true',
          APIFY_LINKEDIN_ENABLED: 'true',
        }),
      ),
    ).toEqual({
      globallyEnabled: true,
      linkedInEnabled: true,
      xingEnabled: false,
    });
  });
});
