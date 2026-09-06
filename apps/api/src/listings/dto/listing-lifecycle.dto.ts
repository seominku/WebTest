import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ListingVersionDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class PublishListingDto extends ListingVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays!: number;
}
