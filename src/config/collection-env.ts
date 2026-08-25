import { ConfigService } from '@nestjs/config';
import { JobSource } from '../database/entities';

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
  isEnabledFlag(config, `APIFY_${source.toUpperCase()}_ENABLED`);

/**
 * Reads the dashboard-facing collection flags from the environment.
 */
export const getCollectionEnv = (config: ConfigService) => ({
  globallyEnabled: isEnabledFlag(config, 'COLLECTION_ENABLED'),
  linkedInEnabled: isEnabledFlag(config, 'APIFY_LINKEDIN_ENABLED'),
  xingEnabled: isEnabledFlag(config, 'APIFY_XING_ENABLED'),
});
