import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const client = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = dirname(client);
const lock = JSON.parse(readFileSync(join(client, 'package-lock.json'), 'utf8'));
const packages = Object.entries(lock.packages).filter(([path]) => path).map(([path, entry]) => ({
  name: entry.name || path.slice(path.lastIndexOf('node_modules/') + 13), version: entry.version,
  license: entry.license || 'NOT-DECLARED', development: !!entry.dev, optional: !!entry.optional, path,
})).sort((a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en') || a.path.localeCompare(b.path, 'en'));
const inventory = JSON.stringify({ lockfileVersion: lock.lockfileVersion, packages }, null, 2) + '\n';
const inventoryPath = join(root, 'docs/dependency-licenses.json');
const overrides = JSON.parse(readFileSync(join(client, 'scripts/upstream-license-overrides.json'), 'utf8'));
for (const override of Object.values(overrides)) {
  const bytes = readFileSync(join(client, 'scripts', override.file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), override.sha256, 'Reviewed upstream license checksum changed.');
}
const check = process.argv.includes('--check');
if (check) {
  assert.equal(readFileSync(inventoryPath, 'utf8'), inventory, 'Run npm run licenses:generate after changing the lock file.');
  assert.ok(existsSync(join(root, 'THIRD_PARTY_LICENSES.txt')));
  console.log(`License inventory matches ${packages.length} locked packages.`);
} else {
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(inventoryPath, inventory);
  const notices = ['Mist Notes third-party runtime notices',
    'Generated from the locked production dependency graph. Upstream licenses remain in force.',
    'Electron/Chromium license files are distributed with Electron and must also be preserved in binary releases.', ''];
  for (const entry of packages.filter(item => !item.development)) {
    const directory = join(client, entry.path);
    assert.ok(existsSync(directory), `Install production package ${entry.name} before generating notices.`);
    const files = readdirSync(directory).filter(name => /^(?:licen[cs]e|copying|notice)(?:\.[^/]*)?$/i.test(name)).sort();
    notices.push('='.repeat(72), `${entry.name}@${entry.version} (${entry.license})`);
    if (files.length) {
      for (const name of files) notices.push(`--- ${name} ---`, readFileSync(join(directory, name), 'utf8').trim(), '');
    } else {
      const override = overrides[`${entry.name}@${entry.version}`];
      assert.ok(override, `Review missing upstream license text: ${entry.name}`);
      notices.push(override.reason, `Source: ${override.source}`, readFileSync(join(client, 'scripts', override.file), 'utf8').trim(), '');
    }
  }
  writeFileSync(join(root, 'THIRD_PARTY_LICENSES.txt'), notices.join('\n') + '\n');
  console.log(`Generated inventory for ${packages.length} packages and preserved production dependency notices.`);
}
