import { DefaultAzureCredential } from '@azure/identity';
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import { Injectable } from '@nestjs/common';

export type ObjectStorageProvider = 'unconfigured' | 'azure_blob' | 's3_compatible';
export type UploadAuthorization =
  | 'not_configured'
  | 'shared_key_sas'
  | 'user_delegation_sas';

export interface UploadTransportDescriptor {
  provider: ObjectStorageProvider;
  configured: boolean;
  authorization: UploadAuthorization;
  uploadUrl: string | null;
  expiresAt: string | null;
  requiredHeaders: Record<string, string>;
}

export interface StoredObjectMetadata {
  provider: 'azure_blob';
  objectKey: string;
  sizeBytes: number;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
}

@Injectable()
export class ObjectStorageService {
  private readonly provider = normalizeProvider(process.env.OBJECT_STORAGE_PROVIDER);
  private readonly containerName = process.env.AZURE_STORAGE_CONTAINER?.trim() || 'lifeos-documents';
  private readonly autoCreateContainer = process.env.AZURE_STORAGE_AUTO_CREATE_CONTAINER === 'true';
  private readonly accountName: string | null;
  private readonly blobService: BlobServiceClient | null;
  private readonly sharedKey: StorageSharedKeyCredential | null;
  private readonly authorization: UploadAuthorization;
  private readonly allowsHttp: boolean;

  constructor() {
    if (this.provider !== 'azure_blob') {
      this.accountName = null;
      this.blobService = null;
      this.sharedKey = null;
      this.authorization = 'not_configured';
      this.allowsHttp = false;
      return;
    }

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
    if (connectionString) {
      const parsed = parseConnectionString(connectionString);
      if (!parsed.accountName || !parsed.accountKey) {
        this.accountName = null;
        this.blobService = null;
        this.sharedKey = null;
        this.authorization = 'not_configured';
        this.allowsHttp = false;
        return;
      }

      this.accountName = parsed.accountName;
      this.sharedKey = new StorageSharedKeyCredential(parsed.accountName, parsed.accountKey);
      this.blobService = BlobServiceClient.fromConnectionString(connectionString);
      this.authorization = 'shared_key_sas';
      this.allowsHttp = /DefaultEndpointsProtocol=http(?:;|$)/i.test(connectionString)
        || /BlobEndpoint=http:\/\//i.test(connectionString);
      return;
    }

    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME?.trim();
    const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL?.trim()
      || (accountName ? `https://${accountName}.blob.core.windows.net` : null);

    if (!accountName || !accountUrl) {
      this.accountName = null;
      this.blobService = null;
      this.sharedKey = null;
      this.authorization = 'not_configured';
      this.allowsHttp = false;
      return;
    }

    this.accountName = accountName;
    this.sharedKey = null;
    this.blobService = new BlobServiceClient(accountUrl, new DefaultAzureCredential());
    this.authorization = 'user_delegation_sas';
    this.allowsHttp = false;
  }

  get configured() {
    return this.provider === 'azure_blob'
      && this.blobService !== null
      && this.accountName !== null
      && this.authorization !== 'not_configured';
  }

  get capability() {
    return {
      provider: this.provider,
      configured: this.configured,
      directUploadAuthorization: this.authorization,
      container: this.configured ? this.containerName : null,
    };
  }

  describeUnconfiguredTransport(): UploadTransportDescriptor {
    return {
      provider: this.provider,
      configured: false,
      authorization: 'not_configured',
      uploadUrl: null,
      expiresAt: null,
      requiredHeaders: {},
    };
  }

  async createUploadTransport(
    objectKey: string,
    contentType: string,
  ): Promise<UploadTransportDescriptor> {
    if (!this.configured || !this.blobService || !this.accountName) {
      return this.describeUnconfiguredTransport();
    }

    const container = this.blobService.getContainerClient(this.containerName);
    if (this.autoCreateContainer) {
      await container.createIfNotExists();
    }

    const blob = container.getBlockBlobClient(objectKey);
    const startsOn = new Date(Date.now() - 60_000);
    const expiresOn = new Date(Date.now() + 10 * 60_000);

    const values = {
      containerName: this.containerName,
      blobName: objectKey,
      permissions: BlobSASPermissions.parse('cw'),
      startsOn,
      expiresOn,
      protocol: this.allowsHttp ? SASProtocol.HttpsAndHttp : SASProtocol.Https,
    };

    const sas = this.sharedKey
      ? generateBlobSASQueryParameters(values, this.sharedKey).toString()
      : generateBlobSASQueryParameters(
          values,
          await this.blobService.getUserDelegationKey(startsOn, expiresOn),
          this.accountName,
        ).toString();

    return {
      provider: 'azure_blob',
      configured: true,
      authorization: this.authorization,
      uploadUrl: `${blob.url}?${sas}`,
      expiresAt: expiresOn.toISOString(),
      requiredHeaders: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': contentType,
      },
    };
  }

  async statObject(objectKey: string): Promise<StoredObjectMetadata | null> {
    if (!this.configured || !this.blobService) {
      throw new Error('OBJECT_STORAGE_NOT_CONFIGURED');
    }

    const blob = this.blobService
      .getContainerClient(this.containerName)
      .getBlockBlobClient(objectKey);

    if (!(await blob.exists())) {
      return null;
    }

    const properties = await blob.getProperties();

    return {
      provider: 'azure_blob',
      objectKey,
      sizeBytes: properties.contentLength ?? 0,
      contentType: properties.contentType ?? null,
      etag: properties.etag ?? null,
      lastModified: properties.lastModified?.toISOString() ?? null,
    };
  }
}

function normalizeProvider(value?: string): ObjectStorageProvider {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'azure_blob') return 'azure_blob';
  if (normalized === 's3_compatible') return 's3_compatible';
  return 'unconfigured';
}

function parseConnectionString(value: string) {
  const entries = new Map<string, string>();

  for (const segment of value.split(';')) {
    if (!segment) continue;
    const separator = segment.indexOf('=');
    if (separator < 1) continue;
    entries.set(segment.slice(0, separator), segment.slice(separator + 1));
  }

  return {
    accountName: entries.get('AccountName') ?? null,
    accountKey: entries.get('AccountKey') ?? null,
  };
}
