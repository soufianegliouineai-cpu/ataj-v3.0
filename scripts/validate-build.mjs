import { readFileSync } from 'node:fs';

const html = readFileSync('index.html','utf8');
const vercel = JSON.parse(readFileSync('vercel.json','utf8'));
const pkg = JSON.parse(readFileSync('package.json','utf8'));
const edgeOpenapi = JSON.parse(readFileSync('openapi.json','utf8'));
const nestOpenapi = JSON.parse(readFileSync('apps/api/openapi.json','utf8'));

const required = [
  '<title>LifeOS AI',
  'lifeos-api',
  '/v1/protection/expiry',
  "method:'POST'",
  "'Idempotency-Key'",
  'documentType',
  'expiryDate',
  'leadDays',
  'User input',
  'no legal rule applied',
  'Content-Security-Policy',
  'connect-src https://kxlrkgbyxplvsvelhdpq.supabase.co'
];

const supportedDocumentTypes = [
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
];

const failures = [];
for (const token of required) {
  if (!html.includes(token)) failures.push(`index.html missing required production token: ${token}`);
}
if (pkg.name !== 'lifeos-ai-web') failures.push('package name must be lifeos-ai-web');
if (pkg.version !== '0.3.0') failures.push('package version must match production API contract 0.3.0');
if (!Array.isArray(vercel.builds) || !vercel.builds.some(b => b.src === 'index.html' && b.use === '@vercel/static')) {
  failures.push('vercel.json must explicitly build index.html with @vercel/static');
}
if (html.includes('/v1/demo/passport?')) failures.push('frontend must not use legacy GET demo route');
if (html.includes('/v1/protection/passport')) failures.push('frontend must use generic expiry protection endpoint');
if (html.includes('EXTRACTED FACT')) failures.push('frontend must not claim extraction before OCR is implemented');
if (html.includes('Open action workspace')) failures.push('frontend must not expose an unimplemented action workspace');
if (html.includes('AI EVIDENCE')) failures.push('frontend must not label user-confirmed evidence as AI evidence');

for (const [name, openapi] of [['edge', edgeOpenapi], ['nest', nestOpenapi]]) {
  if (openapi.openapi !== '3.1.0') failures.push(`${name} OpenAPI version must be 3.1.0`);
  if (openapi.info?.version !== '0.3.0') failures.push(`${name} OpenAPI contract version must match API 0.3.0`);
}

if (!edgeOpenapi.paths?.['/v1/protection/expiry']?.post) failures.push('Edge OpenAPI missing POST /v1/protection/expiry');
if (!edgeOpenapi.paths?.['/readiness']?.get) failures.push('Edge OpenAPI missing GET /readiness');

function requiresBearer(path, method, label) {
  const operation = nestOpenapi.paths?.[path]?.[method];
  if (!operation?.security?.some(entry => Object.hasOwn(entry, 'bearerAuth'))) {
    failures.push(`Nest OpenAPI missing authenticated ${label}`);
  }
  return operation;
}

requiresBearer('/home', 'get', 'Home aggregate');
requiresBearer('/reminders', 'get', 'reminder list');
requiresBearer('/households', 'get', 'household list');
requiresBearer('/households/{householdId}/people', 'get', 'household people list');
requiresBearer('/households/{householdId}/people', 'post', 'household person creation');
requiresBearer('/households/{householdId}/timeline', 'get', 'Life Timeline route');
requiresBearer('/households/{householdId}/tasks/{taskId}/complete', 'post', 'task completion');
requiresBearer('/households/{householdId}/uploads/intents', 'post', 'upload intent creation');
requiresBearer('/households/{householdId}/uploads', 'get', 'upload list');
requiresBearer('/households/{householdId}/uploads/{uploadId}/finalize', 'post', 'upload finalization');
requiresBearer('/households/{householdId}/uploads/{uploadId}/process', 'post', 'processing enqueue');
requiresBearer('/households/{householdId}/uploads/{uploadId}/process', 'get', 'processing status');
requiresBearer('/households/{householdId}/extractions/{runId}', 'get', 'extraction review');
const extractionConfirmPath = requiresBearer('/households/{householdId}/extractions/{runId}/fields/{fieldId}/confirm', 'post', 'extracted-field confirmation');
if (!String(extractionConfirmPath?.responses?.['201']?.description ?? '').includes('USER_CONFIRMED')) {
  failures.push('Nest extracted-field confirmation must document USER_CONFIRMED trust handoff');
}

const uploadSchema = nestOpenapi.components?.schemas?.CreateUploadIntentRequest;
if (uploadSchema?.properties?.sizeBytes?.maximum !== 26214400) {
  failures.push('Nest OpenAPI upload size limit must be 25 MiB');
}
const uploadMimes = uploadSchema?.properties?.mimeType?.enum ?? [];
for (const mime of ['application/pdf','image/jpeg','image/png','image/heic','image/webp']) {
  if (!uploadMimes.includes(mime)) failures.push(`Nest OpenAPI missing upload MIME ${mime}`);
}

const description = String(nestOpenapi.info?.description ?? '');
for (const capability of ['Azure Blob-compatible', 'ClamAV', 'OCR extraction', 'reminders', 'in-app']) {
  if (!description.includes(capability)) failures.push(`Nest OpenAPI description missing implemented capability: ${capability}`);
}
for (const unconfigured of ['push/email delivery', 'jurisdiction-specific rules']) {
  if (!description.includes(unconfigured)) failures.push(`Nest OpenAPI description must state unconfigured boundary: ${unconfigured}`);
}

const nestServerUrls = (nestOpenapi.servers ?? []).map(server => server.url);
if (nestServerUrls.some(url => /^https:\/\/api\.lifeos\.ai/i.test(url))) {
  failures.push('Nest OpenAPI must not claim undeployed api.lifeos.ai production hosting');
}
if (!nestServerUrls.includes('http://localhost:3000/v1')) {
  failures.push('Nest OpenAPI must identify the verified local/container server');
}

const persistentPath = nestOpenapi.paths?.['/households/{householdId}/protection/expiry']?.post;
if (!persistentPath) failures.push('Nest OpenAPI missing authenticated persistent expiry route');
if (!persistentPath?.security?.some(entry => Object.hasOwn(entry, 'bearerAuth'))) {
  failures.push('Nest persistent expiry route must require bearerAuth');
}
const idem = persistentPath?.parameters?.find(p => p.name === 'Idempotency-Key' && p.in === 'header');
if (!idem?.required) failures.push('Nest persistent expiry route must require Idempotency-Key');

const edgeTypes = edgeOpenapi.components?.schemas?.ExpiryProtectionRequest?.properties?.documentType?.enum ?? [];
const nestTypes = nestOpenapi.components?.schemas?.ExpiryProtectionRequest?.properties?.documentType?.enum ?? [];
for (const type of supportedDocumentTypes) {
  if (!edgeTypes.includes(type)) failures.push(`Edge OpenAPI missing document type ${type}`);
  if (!nestTypes.includes(type)) failures.push(`Nest OpenAPI missing document type ${type}`);
}
if (edgeTypes.length !== supportedDocumentTypes.length) failures.push('Edge OpenAPI document types contain unexpected drift');
if (nestTypes.length !== supportedDocumentTypes.length) failures.push('Nest OpenAPI document types contain unexpected drift');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('LifeOS static, Edge OpenAPI, and Nest OpenAPI contracts validated');
