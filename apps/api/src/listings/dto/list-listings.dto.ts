import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Max,
  Matches,
  Min,
} from 'class-validator';
import { PropertyType, TransactionType } from '@real-estate/db';

export const LISTING_SORTS = [
  'LATEST',
  'PRICE_ASC',
  'PRICE_DESC',
  'AREA_ASC',
  'AREA_DESC',
] as const;

export type ListingSort = (typeof LISTING_SORTS)[number];

export class ListListingsDto {
  @IsOptional()
  @IsIn(LISTING_SORTS)
  sort: ListingSort = 'LATEST';

  @IsOptional()
  @IsEnum(TransactionType)
  transactionType?: TransactionType;

  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 50)
  sido?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 50)
  sigungu?: string;

  @IsOptional()
  @Matches(/^\d{1,12}$/, {
    message: 'Minimum price must be digits in 만원 units',
  })
  minPriceManwon?: string;

  @IsOptional()
  @Matches(/^\d{1,12}$/, {
    message: 'Maximum price must be digits in 만원 units',
  })
  maxPriceManwon?: string;

  @IsOptional()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, {
    message: 'Minimum area must have up to 8 integer and 2 decimal digits',
  })
  minAreaSquareMeters?: string;

  @IsOptional()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, {
    message: 'Maximum area must have up to 8 integer and 2 decimal digits',
  })
  maxAreaSquareMeters?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 12;
}
