import { Module } from '@nestjs/common';
import { ApifyClientService, APIFY_CLIENT_PORT } from './apify-client.service';
import { ApifyLinkedInCollector } from './apify-linkedin.collector';
import { ApifyXingCollector } from './apify-xing.collector';
import { SourceCollectorsService } from './source-collectors.service';

@Module({
  providers: [
    ApifyClientService,
    {
      provide: APIFY_CLIENT_PORT,
      useExisting: ApifyClientService,
    },
    ApifyLinkedInCollector,
    ApifyXingCollector,
    SourceCollectorsService,
  ],
  exports: [SourceCollectorsService],
})
export class CollectorsModule {}
