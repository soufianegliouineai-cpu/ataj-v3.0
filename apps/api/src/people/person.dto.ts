import {
  IsDateString,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreatePersonDto {
  @IsString()
  @Length(1, 120)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  relationship?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  jurisdiction?: string;
}
