import { Injectable } from '@nestjs/common';

export type ObjectStorageProvider = 'unconfigured' | 'azure_blob' | 's3_compatible';

export interface UploadTransportDescriptor {
  provider: ObjectStorageProvider;
  configured: boolean;
  uploadUrl: string | null;
  requiredHeaders: Record<string, string>;
}

@Injectable()
export class ObjectStorageService {
  private readonly provider = normalizeProvider(process.env.OBJECT_STORAGE_PROVIDER);

  get configured() {
    return false;
  }

  get capability() {
    return {
      provider: this.provider,
      configured: this.configured,
      directUploadAuthorization: 'not_configured' as const,
    };
  }

  describeUnconfiguredTransport(): UploadTransportDescriptor {
    return {
      provider: this.provider,
      configured: false,
      uploadUrl: null,
      requiredHeaders: {},
    };
  }
}

function normalizeProvider(value?: string): ObjectStorageProvider {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'azure_blob') return 'azure_blob';
  if (normalized === 's3_compatible') return 's3_compatible';
  return 'unconfigured';
}
