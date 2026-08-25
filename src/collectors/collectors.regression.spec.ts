import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Reads all runtime collector source files while excluding tests and fixtures.
 */
const runtimeCollectorSource = (): string =>
  readdirSync(__dirname)
    .filter(
      (file) =>
        file.endsWith('.ts') &&
        !file.endsWith('.spec.ts') &&
        !file.endsWith('.test.ts'),
    )
    .map((file) => readFileSync(join(__dirname, file), 'utf8'))
    .join('\n');

describe('collector direct-access regression', () => {
  it('keeps direct source-page HTTP and retired collector classes out of runtime code', () => {
    const source = runtimeCollectorSource();

    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/linkedin\.com\/jobs/i);
    expect(source).not.toMatch(/xing\.com\/jobs/i);
    expect(source).not.toMatch(
      /\b(?:HttpJobCollector|LinkedInJobCollector|XingJobCollector)\b/,
    );
  });
});
