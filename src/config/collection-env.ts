import { ConfigService } from '@nestjs/config';
import { JobSource } from '../database/entities';

export type CollectionMode = 'live' | 'fixture';

/**
 * Reads a boolean environment flag that is only on when set to the string "true".
 */
export const isEnabledFlag = (config: ConfigService, key: string): boolean =>
  config.get<string>(key, 'false') === 'true';

/**
 * Returns whether collection may run for one source.
 */
export const isSourceCollectionEnabled = (
  config: ConfigService,
  source: JobSource,
): boolean =>
  isEnabledFlag(config, 'COLLECTION_ENABLED') &&
  isEnabledFlag(config, `${source.toUpperCase()}_COLLECTION_ENABLED`);

/**
 * Returns fixture mode for local tests, or live for authorized source HTTP.
 */
export const getCollectionMode = (config: ConfigService): CollectionMode =>
  config.get<string>('COLLECTION_MODE', 'live') === 'fixture'
    ? 'fixture'
    : 'live';

/**
 * Reads the dashboard-facing collection flags from the environment.
 */
export const getCollectionEnv = (config: ConfigService) => ({
  globallyEnabled: isEnabledFlag(config, 'COLLECTION_ENABLED'),
  linkedInEnabled: isEnabledFlag(config, 'LINKEDIN_COLLECTION_ENABLED'),
  xingEnabled: isEnabledFlag(config, 'XING_COLLECTION_ENABLED'),
  mode: getCollectionMode(config),
});
