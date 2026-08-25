import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Exposes a database-backed readiness check for the application.
 */
@Controller('health')
export class HealthController {
  /**
   * Creates a health controller using the active application data source.
   */
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Verifies that PostgreSQL can execute a lightweight query.
   */
  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database is unavailable.');
    }
  }
}
