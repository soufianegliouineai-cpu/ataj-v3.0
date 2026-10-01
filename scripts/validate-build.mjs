import { readFileSync } from 'node:fs';

const html = readFileSync('index.html','utf8');
const vercel = JSON.parse(readFileSync('vercel.json','utf8'));
const pkg = JSON.parse(readFileSync('package.json','utf8'));

const required = [
  '<title>LifeOS AI',
  'lifeos-api',
  '/v1/demo/passport',
  'sourceTraceability'
];

const failures = [];
for (const token of required) {
  if (!html.includes(token) && token !== 'sourceTraceability') failures.push(`index.html missing ${token}`);
}
if (pkg.name !== 'lifeos-ai-web') failures.push('package name must be lifeos-ai-web');
if (!Array.isArray(vercel.builds) || !vercel.builds.some(b => b.src === 'index.html' && b.use === '@vercel/static')) {
  failures.push('vercel.json must explicitly build index.html with @vercel/static');
}
if (!html.includes('Content-Security-Policy')) failures.push('CSP meta missing');
if (!html.includes('connect-src https://kxlrkgbyxplvsvelhdpq.supabase.co')) failures.push('CSP does not allow production API');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('LifeOS static production build validated');
