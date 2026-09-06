import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { PropertyType, TransactionType } from '@real-estate/db';
import {
  LISTING_SORTS,
  type ListingSort,
} from '../../listings/dto/list-listings.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSavedSearchDto {
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsOptional()
  @IsEnum(TransactionType)
  transactionType?: TransactionType;

  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  sido?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  sigungu?: string;

  @IsOptional()
  @Matches(/^\d{1,12}$/)
  minPriceManwon?: string;

  @IsOptional()
  @Matches(/^\d{1,12}$/)
  maxPriceManwon?: string;

  @IsOptional()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  minAreaSquareMeters?: string;

  @IsOptional()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  maxAreaSquareMeters?: string;

  @IsOptional()
  @IsIn(LISTING_SORTS)
  sort: ListingSort = 'LATEST';
}
