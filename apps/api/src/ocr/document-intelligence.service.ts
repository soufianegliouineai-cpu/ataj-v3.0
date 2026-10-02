import { createHash } from 'node:crypto';
import { DefaultAzureCredential } from '@azure/identity';
import { Injectable } from '@nestjs/common';
import type { SupportedDocumentType } from '../constants.js';

const API_VERSION = '2024-11-30';
const TOKEN_SCOPE = 'https://cognitiveservices.azure.com/.default';

export interface OcrExtractedField {
  key: string;
  value: unknown;
  normalizedValue: string | null;
  confidence: number;
  pageNumber: number;
  boundingBox: unknown | null;
  sourceTextHash: string | null;
}

export interface OcrAnalysisResult {
  provider: 'azure_document_intelligence';
  modelName: string;
  modelVersion: string | null;
  apiVersion: string;
  pageCount: number | null;
  fields: OcrExtractedField[];
}

export class OcrProviderError extends Error {
  constructor(
    public readonly ocrCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'OcrProviderError';
  }
}

@Injectable()
export class DocumentIntelligenceService {
  private readonly provider = process.env.OCR_PROVIDER?.trim().toLowerCase();
  private readonly endpoint = normalizeEndpoint(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT);
  private readonly apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY?.trim() || null;
  private readonly authMode = process.env.OCR_AUTH_MODE?.trim().toLowerCase() || (
    this.apiKey ? 'api_key' : 'unconfigured'
  );
  private readonly allowHttp = process.env.OCR_ALLOW_HTTP === 'true';
  private readonly pollIntervalMs = parsePositiveInt(process.env.OCR_POLL_INTERVAL_MS, 500);
  private readonly timeoutMs = parsePositiveInt(process.env.OCR_TIMEOUT_MS, 60_000);
  private readonly credential = this.authMode === 'managed_identity'
    ? new DefaultAzureCredential()
    : null;

  get configured() {
    if (this.provider !== 'azure_document_intelligence' || !this.endpoint) return false;
    if (this.endpoint.protocol !== 'https:' && !this.allowHttp) return false;
    return this.authMode === 'api_key'
      ? Boolean(this.apiKey)
      : this.authMode === 'managed_identity';
  }

  get capability() {
    return {
      provider: this.configured ? 'azure_document_intelligence' : 'unconfigured',
      configured: this.configured,
      apiVersion: this.configured ? API_VERSION : null,
      authentication: this.configured ? this.authMode : 'not_configured',
    };
  }

  async analyze(
    bytes: Buffer,
    contentType: string,
    documentType: SupportedDocumentType,
  ): Promise<OcrAnalysisResult> {
    if (!this.configured || !this.endpoint) {
      throw new OcrProviderError(
        'OCR_NOT_CONFIGURED',
        'OCR provider is not configured.',
      );
    }

    const modelName = modelFor(documentType);
    const analyzeUrl = new URL(
      `documentintelligence/documentModels/${encodeURIComponent(modelName)}:analyze`,
      ensureTrailingSlash(this.endpoint),
    );
    analyzeUrl.searchParams.set('api-version', API_VERSION);

    const response = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        ...(await this.authHeaders()),
        'Content-Type': contentType,
      },
      body: bytes,
      redirect: 'error',
    });

    if (response.status !== 202) {
      throw await providerHttpError('OCR_ANALYZE_REJECTED', response);
    }

    const operationLocation = response.headers.get('operation-location');
    if (!operationLocation) {
      throw new OcrProviderError(
        'OCR_OPERATION_LOCATION_MISSING',
        'Document Intelligence did not return an operation location.',
      );
    }

    const operationUrl = new URL(operationLocation, this.endpoint);
    if (operationUrl.origin !== this.endpoint.origin) {
      throw new OcrProviderError(
        'OCR_OPERATION_ORIGIN_MISMATCH',
        'Document Intelligence returned an unexpected operation origin.',
      );
    }

    const deadline = Date.now() + this.timeoutMs;

    while (Date.now() < deadline) {
      const resultResponse = await fetch(operationUrl, {
        headers: await this.authHeaders(),
        redirect: 'error',
      });

      if (!resultResponse.ok) {
        throw await providerHttpError('OCR_RESULT_REJECTED', resultResponse);
      }

      const payload = await resultResponse.json() as AzureOperationResult;
      const status = payload.status?.toLowerCase();

      if (status === 'succeeded') {
        return normalizeResult(payload, modelName);
      }

      if (status === 'failed') {
        throw new OcrProviderError(
          'OCR_ANALYSIS_FAILED',
          'Document Intelligence analysis failed.',
        );
      }

      if (status !== 'running' && status !== 'notstarted') {
        throw new OcrProviderError(
          'OCR_PROTOCOL_ERROR',
          'Document Intelligence returned an unexpected analysis status.',
        );
      }

      await sleep(this.pollIntervalMs);
    }

    throw new OcrProviderError(
      'OCR_TIMEOUT',
      'Document Intelligence analysis did not complete before the timeout.',
    );
  }

  private async authHeaders(): Promise<Record<string, string>> {
    if (this.authMode === 'api_key' && this.apiKey) {
      return { 'Ocp-Apim-Subscription-Key': this.apiKey };
    }

    if (this.authMode === 'managed_identity' && this.credential) {
      const token = await this.credential.getToken(TOKEN_SCOPE);
      if (!token?.token) {
        throw new OcrProviderError(
          'OCR_TOKEN_UNAVAILABLE',
          'Managed identity could not obtain a Document Intelligence token.',
        );
      }
      return { Authorization: `Bearer ${token.token}` };
    }

    throw new OcrProviderError('OCR_AUTH_NOT_CONFIGURED', 'OCR authentication is not configured.');
  }
}

interface AzureOperationResult {
  status?: string;
  analyzeResult?: {
    apiVersion?: string;
    modelId?: string;
    content?: string;
    pages?: Array<{
      pageNumber?: number;
      words?: Array<{ content?: string; confidence?: number }>;
    }>;
    documents?: Array<{
      fields?: Record<string, AzureField>;
    }>;
  };
}

interface AzureField {
  type?: string;
  content?: string;
  valueString?: string;
  valueDate?: string;
  valueNumber?: number;
  valueInteger?: number;
  valueCountryRegion?: string;
  confidence?: number;
  boundingRegions?: Array<{
    pageNumber?: number;
    polygon?: number[];
  }>;
}

const CANONICAL_FIELDS: Record<string, string[]> = {
  expiry_date: ['DateOfExpiration', 'ExpirationDate', 'ExpiryDate'],
  document_number: ['DocumentNumber', 'IdNumber'],
  date_of_birth: ['DateOfBirth', 'BirthDate'],
  first_name: ['FirstName', 'GivenName'],
  last_name: ['LastName', 'Surname'],
  nationality: ['Nationality'],
  country_region: ['CountryRegion', 'Country'],
  sex: ['Sex', 'Gender'],
  issue_date: ['DateOfIssue', 'IssueDate'],
  invoice_date: ['InvoiceDate'],
  due_date: ['DueDate'],
  invoice_id: ['InvoiceId'],
};

function normalizeResult(payload: AzureOperationResult, modelName: string): OcrAnalysisResult {
  const analyzeResult = payload.analyzeResult ?? {};
  const sourceFields = analyzeResult.documents?.[0]?.fields ?? {};
  const fields: OcrExtractedField[] = [];

  for (const [canonicalKey, candidates] of Object.entries(CANONICAL_FIELDS)) {
    const source = candidates
      .map((candidate) => sourceFields[candidate])
      .find((candidate): candidate is AzureField => Boolean(candidate));

    if (!source) continue;

    const value = fieldValue(source);
    if (value === undefined || value === null || value === '') continue;

    const content = source.content ?? String(value);
    const region = source.boundingRegions?.[0];

    fields.push({
      key: canonicalKey,
      value,
      normalizedValue: normalizeFieldValue(value),
      confidence: normalizeConfidence(source.confidence),
      pageNumber: validPage(region?.pageNumber),
      boundingBox: region?.polygon ? { polygon: region.polygon } : null,
      sourceTextHash: content
        ? createHash('sha256').update(content, 'utf8').digest('hex')
        : null,
    });
  }

  return {
    provider: 'azure_document_intelligence',
    modelName,
    modelVersion: null,
    apiVersion: analyzeResult.apiVersion ?? API_VERSION,
    pageCount: analyzeResult.pages?.length ? analyzeResult.pages.length : null,
    fields,
  };
}

function fieldValue(field: AzureField): unknown {
  if (field.valueDate !== undefined) return field.valueDate;
  if (field.valueString !== undefined) return field.valueString;
  if (field.valueCountryRegion !== undefined) return field.valueCountryRegion;
  if (field.valueInteger !== undefined) return field.valueInteger;
  if (field.valueNumber !== undefined) return field.valueNumber;
  if (field.content !== undefined) return field.content;
  return undefined;
}

function normalizeFieldValue(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function normalizeConfidence(value?: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value)));
}

function validPage(value?: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

function modelFor(documentType: SupportedDocumentType) {
  switch (documentType) {
    case 'passport':
    case 'identity_card':
    case 'driving_license':
    case 'residence_permit':
      return 'prebuilt-idDocument';
    case 'invoice':
      return 'prebuilt-invoice';
    case 'contract':
      return 'prebuilt-contract';
    default:
      return 'prebuilt-layout';
  }
}

function normalizeEndpoint(value?: string) {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function ensureTrailingSlash(url: URL) {
  return new URL(url.href.endsWith('/') ? url.href : url.href + '/');
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function providerHttpError(code: string, response: Response) {
  let serviceCode: string | null = null;
  try {
    const payload = await response.json() as { error?: { code?: string } };
    serviceCode = typeof payload.error?.code === 'string' ? payload.error.code : null;
  } catch {
    // Intentionally ignore unstructured provider error bodies.
  }

  return new OcrProviderError(
    code,
    `Document Intelligence request failed with HTTP ${response.status}${serviceCode ? ` (${serviceCode})` : ''}.`,
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
