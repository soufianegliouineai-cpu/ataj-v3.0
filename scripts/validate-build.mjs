import { readFileSync } from 'node:fs';

const html = readFileSync('index.html','utf8');
const vercel = JSON.parse(readFileSync('vercel.json','utf8'));
const pkg = JSON.parse(readFileSync('package.json','utf8'));
const openapi = JSON.parse(readFileSync('openapi.json','utf8'));

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

if (openapi.openapi !== '3.1.0') failures.push('OpenAPI version must be 3.1.0');
if (openapi.info?.version !== '0.3.0') failures.push('OpenAPI contract version must match API 0.3.0');
if (!openapi.paths?.['/v1/protection/expiry']?.post) failures.push('OpenAPI missing POST /v1/protection/expiry');
if (!openapi.paths?.['/readiness']?.get) failures.push('OpenAPI missing GET /readiness');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('LifeOS v0.3 static production and OpenAPI contract validated');
