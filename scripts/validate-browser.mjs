import { readFileSync } from 'node:fs';

const html = readFileSync('index.html','utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);

if (scripts.length !== 1) {
  console.error(`Expected exactly one inline application script, found ${scripts.length}`);
  process.exit(1);
}

try {
  new Function(scripts[0]);
} catch (error) {
  console.error('Browser bundle syntax error:', error);
  process.exit(1);
}

if (/\son[a-z]+\s*=/i.test(html)) {
  console.error('Inline DOM event handlers are forbidden; bind events from the application script.');
  process.exit(1);
}

console.log('LifeOS browser bundle syntax validated');
