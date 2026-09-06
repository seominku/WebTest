import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export class CreateViewingDto {
  @IsUUID('4')
  listingId!: string;

  @IsISO8601({ strict: true })
  requestedAt!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @Length(2, 500)
  message?: string;
}

export class RespondViewingDto {
  @IsIn(['CONFIRMED', 'DECLINED'])
  status!: 'CONFIRMED' | 'DECLINED';

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @Length(2, 500)
  responseMessage?: string;
}

export class ProposeViewingRescheduleDto {
  @IsISO8601({ strict: true })
  proposedAt!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @Length(2, 500)
  message?: string;
}

export class RespondViewingRescheduleDto {
  @IsBoolean()
  accepted!: boolean;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @Length(2, 500)
  responseMessage?: string;
}
