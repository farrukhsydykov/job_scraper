import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { JobSource } from '../database/entities';
import {
  getCollectionEnv,
  getCollectionMode,
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
      LINKEDIN_COLLECTION_ENABLED: 'true',
      XING_COLLECTION_ENABLED: 'false',
    });

    expect(isSourceCollectionEnabled(config, JobSource.LINKEDIN)).toBe(true);
    expect(isSourceCollectionEnabled(config, JobSource.XING)).toBe(false);
  });

  it('treats fixture as the local test mode and anything else as live', () => {
    expect(getCollectionMode(createConfig({ COLLECTION_MODE: 'fixture' }))).toBe(
      'fixture',
    );
    expect(getCollectionMode(createConfig({ COLLECTION_MODE: 'live' }))).toBe(
      'live',
    );
    expect(getCollectionMode(createConfig({}))).toBe('live');
  });

  it('exposes dashboard flags from the environment', () => {
    expect(
      getCollectionEnv(
        createConfig({
          COLLECTION_ENABLED: 'true',
          LINKEDIN_COLLECTION_ENABLED: 'true',
          COLLECTION_MODE: 'fixture',
        }),
      ),
    ).toEqual({
      globallyEnabled: true,
      linkedInEnabled: true,
      xingEnabled: false,
      mode: 'fixture',
    });
  });
});
