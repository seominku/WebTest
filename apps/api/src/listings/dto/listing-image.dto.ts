import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsUUID,
  Min,
} from 'class-validator';

export class ListingImageVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}

export class ReorderListingImagesDto extends ListingImageVersionDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  imageIds: string[];
}
