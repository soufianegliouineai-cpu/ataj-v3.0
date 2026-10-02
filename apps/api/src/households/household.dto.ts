import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateHouseholdDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  homeJurisdiction?: string;
}
