import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectorsModule } from './collectors/collectors.module';
import { createDatabaseOptions } from './database/database.config';
import { DashboardModule } from './dashboard/dashboard.module';
import { JobsModule } from './jobs/jobs.module';
import { RunsModule } from './runs/runs.module';
import { SearchesModule } from './searches/searches.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createDatabaseOptions,
    }),
    ScheduleModule.forRoot(),
    CollectorsModule,
    JobsModule,
    SearchesModule,
    RunsModule,
    DashboardModule,
  ],
})
export class AppModule {}
