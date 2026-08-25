import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  EmploymentType,
  JobSource,
  JobStatus,
  WorkplaceType,
} from './database/entities';

const emptyStringToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreateSavedSearchDto {
  @IsEnum(JobSource)
  source!: JobSource;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  keyword!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  location?: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(1440)
  scheduleMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  resultLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(15)
  runWindowMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  requestDelaySeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  requestJitterSeconds?: number;
}

export class UpdateSavedSearchDto {
  @IsOptional()
  @IsEnum(JobSource)
  source?: JobSource;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  keyword?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  location?: string | null;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(1440)
  scheduleMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  resultLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(15)
  runWindowMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  requestDelaySeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  requestJitterSeconds?: number;
}

export class JobListQueryDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEnum(JobSource)
  source?: JobSource;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEnum(JobStatus)
  status?: JobStatus;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  location?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEnum(WorkplaceType)
  workplaceType?: WorkplaceType;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsISO8601()
  publishedAfter?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  page?: number;
}
