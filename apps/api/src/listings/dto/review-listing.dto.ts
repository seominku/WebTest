import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { ReviewDecision } from '@real-estate/db';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SubmitListingReviewDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class ReviewListingDto extends SubmitListingReviewDto {
  @IsEnum(ReviewDecision)
  decision!: ReviewDecision;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(5, 2000)
  note?: string;
}
