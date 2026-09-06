import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  AddressVisibility,
  PropertyType,
  TransactionType,
} from '@real-estate/db';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const MONEY_PATTERN = /^\d{1,16}$/;

export class SaveListingDto {
  @IsEnum(TransactionType)
  transactionType!: TransactionType;

  @IsEnum(PropertyType)
  propertyType!: PropertyType;

  @Transform(trim)
  @Matches(/^(?=.*[1-9])\d{1,8}(\.\d{1,2})?$/, {
    message:
      '전용면적은 0보다 큰 숫자로 정수 8자리, 소수점 둘째 자리까지 입력해 주세요',
  })
  areaSquareMeters!: string;

  @IsOptional()
  @IsInt()
  @Min(-20)
  @Max(200)
  floor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  totalFloors?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  bathrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(1800)
  @Max(2200)
  buildYear?: number;

  @Transform(trim)
  @IsString()
  @Length(1, 50)
  sido!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 50)
  sigungu!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 80)
  eupmyeondong!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 255)
  roadAddress!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  detailAddress?: string;

  @Transform(trim)
  @IsOptional()
  @Matches(/^\d{5}$/, {
    message: '우편번호는 숫자 5자리로 입력해 주세요',
  })
  postalCode?: string;

  @IsEnum(AddressVisibility)
  addressVisibility!: AddressVisibility;

  @Transform(trim)
  @IsString()
  @Length(5, 120)
  title!: string;

  @Transform(trim)
  @IsString()
  @Length(20, 5000)
  description!: string;

  @IsOptional()
  @Matches(MONEY_PATTERN)
  salePriceKrw?: string;

  @IsOptional()
  @Matches(MONEY_PATTERN)
  depositKrw?: string;

  @IsOptional()
  @Matches(MONEY_PATTERN)
  monthlyRentKrw?: string;

  @IsOptional()
  @Matches(MONEY_PATTERN)
  maintenanceFeeKrw?: string;
}

export class UpdateListingDto extends SaveListingDto {
  @IsInt()
  @Min(1)
  version!: number;
}
