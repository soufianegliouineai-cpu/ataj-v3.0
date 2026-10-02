import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { SUPPORTED_DOCUMENT_TYPES, type SupportedDocumentType } from '../constants.js';

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
] as const;

export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export class CreateUploadIntentDto {
  @IsString()
  @Length(1, 180)
  @Matches(/^[^\\/\u0000]+$/, {
    message: 'fileName must be a base filename without path separators.',
  })
  fileName!: string;

  @IsIn(ALLOWED_UPLOAD_MIME_TYPES)
  mimeType!: AllowedUploadMimeType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(26_214_400)
  sizeBytes!: number;

  @IsIn(SUPPORTED_DOCUMENT_TYPES)
  documentType!: SupportedDocumentType;

  @IsOptional()
  @IsUUID('4')
  personId?: string;

  @IsOptional()
  @Matches(/^[0-9a-fA-F]{64}$/, {
    message: 'sha256 must contain exactly 64 hexadecimal characters.',
  })
  sha256?: string;
}
