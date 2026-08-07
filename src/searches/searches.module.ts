import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavedSearch } from '../database/entities';
import { SearchesController } from './searches.controller';
import { SearchesService } from './searches.service';

@Module({
  imports: [TypeOrmModule.forFeature([SavedSearch])],
  controllers: [SearchesController],
  providers: [SearchesService],
  exports: [SearchesService],
})
export class SearchesModule {}
