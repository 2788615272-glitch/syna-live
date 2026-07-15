import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ignored = new Set(['node_modules', 'dist', '.git']);
const codeExtensions = new Set(['.js', '.mjs']);
const textExtensions = new Set(['.js', '.mjs', '.json', '.md', '.html', '.css', '.yml', '.yaml', '.txt', '.example']);
const forbidden = [
  { name: 'private workspace path', pattern: /D:\\mindcraft/i },
  { name: 'private user nickname', pattern: new RegExp(String.fromCodePoint(22235, 20998, 20043, 19968, 39640, 25163)) },
  { name: 'hard-coded Bilibili session', pattern: /SESSDATA\s*[:=]\s*["'][^"']{20,}/i },
  { name: 'OpenAI-style secret', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ }
];

const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else files.push(file);
  }
}

await walk(root);
for (const file of files.filter((item) => codeExtensions.has(path.extname(item)))) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

const findings = [];
for (const file of files.filter((item) => textExtensions.has(path.extname(item)) || item.endsWith('.env.example'))) {
  const content = await readFile(file, 'utf8');
  for (const rule of forbidden) if (rule.pattern.test(content)) findings.push(`${path.relative(root, file)}: ${rule.name}`);
}

if (findings.length) {
  console.error(findings.join('\n'));
  process.exit(1);
}
console.log(`Checked ${files.length} repository files.`);
