import { readFileSync } from 'node:fs';

const html = readFileSync('index.html','utf8');
const vercel = JSON.parse(readFileSync('vercel.json','utf8'));
const pkg = JSON.parse(readFileSync('package.json','utf8'));

const required = [
  '<title>LifeOS AI',
  'lifeos-api',
  '/v1/protection/passport',
  "method:'POST'",
  "'Idempotency-Key'",
  "expiryDate:'2027-06-12'",
  'Content-Security-Policy',
  'connect-src https://kxlrkgbyxplvsvelhdpq.supabase.co'
];

const failures = [];
for (const token of required) {
  if (!html.includes(token)) failures.push(`index.html missing required production token: ${token}`);
}
if (pkg.name !== 'lifeos-ai-web') failures.push('package name must be lifeos-ai-web');
if (pkg.version !== '0.2.0') failures.push('package version must match production API contract 0.2.0');
if (!Array.isArray(vercel.builds) || !vercel.builds.some(b => b.src === 'index.html' && b.use === '@vercel/static')) {
  failures.push('vercel.json must explicitly build index.html with @vercel/static');
}
if (html.includes('/v1/demo/passport?')) failures.push('frontend must not use legacy GET demo route');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('LifeOS v0.2 static production build validated');
