import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const rules = [
  ['provider-api-key', /\bsk-[a-f\d]{32,}\b/gi],
  ['long-provider-api-key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{48,}\b/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
  ['credential-in-url', /https?:\/\/[^\s/:]+:[^\s/@]+@[^\s/]+/g],
];
function scan(buffer, path) {
  const text = buffer.toString('utf8');
  const findings = [];
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) findings.push({ path, rule, line: text.slice(0, match.index).split('\n').length });
  }
  return findings;
}
function forbiddenPath(path) {
  return /(?:^|\/)(?:notes(?:\.previous)?\.json|ai-credentials\.json|node_modules|backups|delivery|build|dist|dist-electron|release|release-signed|\.release-review|\.env(?:\.(?!example$)[^/]*)?)(?:\/|$)/i.test(path)
    || /\.(?:p12|pfx|key|dmg|exe|zip|sqlite3?|db)$/i.test(path);
}
function selfTest() {
  assert.equal(scan(Buffer.from('sk-' + 'a'.repeat(32)), 'fixture').length, 1);
  assert.ok(scan(Buffer.from('ghp_' + 'X'.repeat(36)), 'fixture').length);
  assert.ok(scan(Buffer.from('-----BEGIN ' + 'PRIVATE KEY-----'), 'fixture').length);
  assert.deepEqual(scan(Buffer.from('sk-synthetic-test-only-placeholder'), 'fixture'), []);
  assert.ok(forbiddenPath('data/ai-credentials.json'));
  assert.ok(!forbiddenPath('.env.example'));
}
selfTest();
if (process.argv.includes('--self-test')) { console.log('Security scanner fixture checks passed.'); process.exit(0); }
assert.equal(resolve(git(['rev-parse', '--show-toplevel']).toString().trim()), root, 'Run only inside the independent project repository.');
const paths = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean))];
const findings = [];
let filesScanned = 0;
for (const path of paths) {
  if (forbiddenPath(path)) findings.push({ path, rule: 'private-or-generated-path', line: 0 });
  const absolute = resolve(root, path);
  assert.ok(relative(root, absolute) && !relative(root, absolute).startsWith('..'));
  if (!existsSync(absolute)) continue;
  assert.ok(!lstatSync(absolute).isSymbolicLink(), 'Publication candidates must not contain symlinks.');
  findings.push(...scan(readFileSync(absolute), path));
  filesScanned += 1;
}
const commits = git(['rev-list', '--all']).toString().trim().split('\n').filter(Boolean);
const indexed = git(['ls-files', '--stage', '-z']).toString().split('\0').filter(Boolean);
let indexedBlobsScanned = 0;
for (const entry of indexed) {
  const separator = entry.indexOf('\t');
  const [mode, oid, stage] = entry.slice(0, separator).split(' ');
  const path = entry.slice(separator + 1);
  assert.equal(stage, '0', 'Resolve index conflicts before a publication scan.');
  assert.ok(['100644', '100755'].includes(mode), 'Do not publish symlinks or submodule pointers.');
  if (forbiddenPath(path)) findings.push({ path: `index:${path}`, rule: 'private-or-generated-path', line: 0 });
  findings.push(...scan(git(['cat-file', 'blob', oid]), `index:${path}`));
  indexedBlobsScanned += 1;
}
const objects = git(['rev-list', '--objects', '--all']).toString().trim().split('\n').filter(Boolean);
let historicalBlobsScanned = 0;
for (const line of objects) {
  const [oid, ...parts] = line.split(' ');
  if (!parts.length || git(['cat-file', '-t', oid]).toString().trim() !== 'blob') continue;
  const path = parts.join(' ');
  if (forbiddenPath(path)) findings.push({ path: `history:${path}`, rule: 'private-or-generated-path', line: 0 });
  findings.push(...scan(git(['cat-file', 'blob', oid]), `history:${path}`));
  historicalBlobsScanned += 1;
}
const report = { filesScanned, indexedBlobsScanned, commitsScanned: commits.length, historicalBlobsScanned, findings,
  scope: 'Git candidate working files, staged blobs, and all locally reachable history; ignored local files are excluded from publication.',
  limitation: 'Pattern checks and path rules complement human review; they do not prove the absence of every possible secret or personal detail.' };
const index = process.argv.indexOf('--report');
if (index >= 0) {
  assert.ok(process.argv[index + 1], '--report requires a file');
  const target = resolve(process.cwd(), process.argv[index + 1]);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
if (findings.length) process.exitCode = 1;
