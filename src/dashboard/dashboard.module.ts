import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { RunsModule } from '../runs/runs.module';
import { SearchesModule } from '../searches/searches.module';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [JobsModule, SearchesModule, RunsModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
