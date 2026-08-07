import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectorsModule } from '../collectors/collectors.module';
import { CollectionRun } from '../database/entities';
import { JobsModule } from '../jobs/jobs.module';
import { SearchesModule } from '../searches/searches.module';
import { RunsController } from './runs.controller';
import { RunsScheduler } from './runs.scheduler';
import { RunsService } from './runs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CollectionRun]),
    CollectorsModule,
    JobsModule,
    SearchesModule,
  ],
  controllers: [RunsController],
  providers: [RunsService, RunsScheduler],
  exports: [RunsService],
})
export class RunsModule {}
