import { Module } from '@nestjs/common';
import {
  LinkedInJobCollector,
  SourceCollectorsService,
  XingJobCollector,
} from './http-job.collectors';

@Module({
  providers: [LinkedInJobCollector, XingJobCollector, SourceCollectorsService],
  exports: [SourceCollectorsService],
})
export class CollectorsModule {}
