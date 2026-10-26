// Cross-platform static package checks. This does not launch or install the app.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile, listPackage, statFile } from '@electron/asar';

const client = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  assert.ok(['--app', '--arch', '--report'].includes(name) && process.argv[index + 1],
    'Usage: node scripts/verify-built-app.mjs --app <unpacked app> --arch <arm64|x64> [--report <json>]');
  assert.ok(!args.has(name), `Duplicate argument: ${name}`);
  args.set(name, process.argv[index + 1]);
}
assert.ok(args.has('--app') && ['arm64', 'x64'].includes(args.get('--arch')), 'App path and architecture are required');
const appPath = resolve(args.get('--app'));
const isMac = appPath.endsWith('.app');
const resources = isMac ? join(appPath, 'Contents/Resources') : join(appPath, 'resources');
const asar = join(resources, 'app.asar');
const sourcePackage = JSON.parse(readFileSync(join(client, 'package.json'), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const fileHash = path => hash(readFileSync(path));
const unixPath = path => path.split(sep).join('/');
function walk(path) {
  return readdirSync(path).flatMap(name => {
    const full = join(path, name);
    assert.ok(!lstatSync(full).isSymbolicLink(), 'Unexpected symlink in renderer build');
    return lstatSync(full).isDirectory() ? walk(full) : [full];
  });
}

assert.ok(existsSync(asar), 'Build an unpacked application before checking it');
const entries = listPackage(asar).filter(name => !('files' in statFile(asar, name.replace(/^\//, ''))));
const forbiddenFiles = entries.filter(name => /(?:^|\/)(?:notes(?:\.previous)?\.json|ai-credentials\.json|\.env(?:\.[^/]*)?|[^/]+\.(?:key|p12|pfx)|backups?|qa-v2|verification|userData)(?:\/|$)/i.test(name));
assert.deepEqual(forbiddenFiles, [], 'A private-data path was included in app.asar');
const packaged = JSON.parse(extractFile(asar, 'package.json').toString('utf8'));
assert.equal(packaged.version, sourcePackage.version, 'Packaged version differs from source');
assert.equal(packaged.name, sourcePackage.name, 'Packaged identity differs from source');
assert.equal(packaged.license, sourcePackage.license, 'Packaged license differs from source');
for (const entry of ['main', 'preload']) {
  assert.equal(hash(extractFile(asar, `dist-electron/${entry}.cjs`)),
    fileHash(join(client, `dist-electron/${entry}.cjs`)), `Frozen ${entry} bundle differs`);
}
const renderer = walk(join(client, 'dist')).filter(path => !path.endsWith('.map'));
assert.ok(renderer.length, 'Renderer build is empty');
for (const file of renderer) {
  assert.equal(hash(extractFile(asar, unixPath(relative(client, file)))), fileHash(file),
    'Packaged renderer differs from current build');
}
const branding = {};
const requiredNotices = [
  ['THIRD_PARTY_LICENSES.txt', '../THIRD_PARTY_LICENSES.txt'],
  ['THIRD_PARTY_NOTICES.md', '../THIRD_PARTY_NOTICES.md'],
  ['Electron-LICENSE', 'node_modules/electron/dist/LICENSE'],
  ['Chromium-LICENSES.html', 'node_modules/electron/dist/LICENSES.chromium.html'],
];
if (existsSync(resolve(client, '../LICENSE'))) requiredNotices.push(['LICENSE', '../LICENSE']);
for (const [packagedNotice, sourceNotice] of requiredNotices) {
  assert.equal(fileHash(join(resources, 'licenses', packagedNotice)), fileHash(resolve(client, sourceNotice)), 'Required third-party or project license notice differs');
}
for (const name of ['icon.png', 'trayTemplate.png', 'trayTemplate@2x.png']) {
  branding[name] = fileHash(join(client, 'resources', name));
  assert.equal(fileHash(join(resources, 'branding', name)), branding[name], 'Packaged branding differs');
}
if (isMac) assert.equal(fileHash(join(resources, 'icon.icns')), fileHash(join(client, 'resources/icon.icns')));

const executable = readFileSync(isMac
  ? join(appPath, 'Contents/MacOS', sourcePackage.productName)
  : join(appPath, `${sourcePackage.productName}.exe`));
let architecture;
if (isMac) {
  assert.equal(executable.readUInt32LE(0), 0xfeedfacf, 'Expected a single-architecture 64-bit Mach-O');
  const cpu = executable.readUInt32LE(4);
  architecture = cpu === 0x0100000c ? 'arm64' : cpu === 0x01000007 ? 'x64' : 'unknown';
} else {
  assert.equal(executable.toString('ascii', 0, 2), 'MZ');
  const offset = executable.readUInt32LE(0x3c);
  assert.equal(executable.toString('ascii', offset, offset + 4), 'PE\u0000\u0000');
  architecture = executable.readUInt16LE(offset + 4) === 0x8664 ? 'x64' : 'unknown';
}
assert.equal(architecture, args.get('--arch'), 'Executable architecture differs from requested target');
const report = {
  version: packaged.version, platform: isMac ? 'macOS' : 'Windows', architecture,
  verification: 'static-only; installation and runtime require a separate device check',
  mainAndPreloadMatch: true, rendererMatches: true, rendererFiles: renderer.length,
  brandingMatches: true, branding, forbiddenFiles,
  asarSha256: fileHash(asar), windowsExecutableIconResourcesChecked: false,
  licenseNoticesMatchSource: true, licenseNoticeFiles: requiredNotices.length,
};
if (args.has('--report')) writeFileSync(resolve(args.get('--report')), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
