import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateInquiryDto {
  @IsUUID('4')
  listingId!: string;

  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  message!: string;
}

export class RespondInquiryDto {
  @Transform(trim)
  @IsString()
  @Length(2, 2000)
  responseMessage!: string;
}
