export const LIFEOS_API_VERSION = '0.3.0';

export const SUPPORTED_DOCUMENT_TYPES = [
  'passport',
  'identity_card',
  'driving_license',
  'insurance',
  'visa',
  'residence_permit',
  'vehicle_registration',
  'contract',
  'certificate',
  'other',
] as const;

export type SupportedDocumentType = (typeof SUPPORTED_DOCUMENT_TYPES)[number];
