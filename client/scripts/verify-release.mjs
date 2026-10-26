// Static release verification only. Windows runtime checks require a Windows host.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile, listPackage, statFile } from '@electron/asar';

const client = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = join(client, 'release');
const version = JSON.parse(readFileSync(join(client, 'package.json'), 'utf8')).version;
const now = new Date().toISOString();
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fileHash = path => sha256(readFileSync(path));
const exec = (command, args) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
function walk(path) {
  return readdirSync(path).flatMap(name => {
    const full = join(path, name);
    return lstatSync(full).isDirectory() ? walk(full) : [full];
  });
}
function pe(path) {
  const value = readFileSync(path);
  assert.equal(value.toString('ascii', 0, 2), 'MZ');
  const offset = value.readUInt32LE(0x3c);
  assert.equal(value.toString('ascii', offset, offset + 4), 'PE\u0000\u0000');
  const machine = value.readUInt16LE(offset + 4);
  const optional = offset + 24;
  const magic = value.readUInt16LE(optional);
  const dataDirectories = optional + (magic === 0x20b ? 112 : 96);
  const certificateSize = value.readUInt32LE(dataDirectories + 4 * 8 + 4);
  return { machine: `0x${machine.toString(16)}`, architecture: machine === 0x8664 ? 'x64' : machine === 0x14c ? 'x86' : 'unknown', certificatePresent: certificateSize > 0 };
}
// Compare embedded Windows icon frames with the reviewed ICO; file names alone
// do not prove that rcedit replaced the Electron icon in the executable.
function verifyWindowsIcons(path) {
  const value = readFileSync(path);
  const peOffset = value.readUInt32LE(0x3c);
  const optional = peOffset + 24;
  const dataDirectories = optional + (value.readUInt16LE(optional) === 0x20b ? 112 : 96);
  const sectionStart = optional + value.readUInt16LE(peOffset + 20);
  const sections = Array.from({ length: value.readUInt16LE(peOffset + 6) }, (_, index) => {
    const offset = sectionStart + index * 40;
    return { virtual: value.readUInt32LE(offset + 12),
      size: Math.max(value.readUInt32LE(offset + 8), value.readUInt32LE(offset + 16)),
      raw: value.readUInt32LE(offset + 20) };
  });
  function fileOffset(rva) {
    const section = sections.find(section => rva >= section.virtual && rva < section.virtual + section.size);
    assert.ok(section, `PE resource RVA outside sections: ${rva}`);
    return section.raw + rva - section.virtual;
  }
  const base = fileOffset(value.readUInt32LE(dataDirectories + 16));
  const resources = [];
  function directory(offset, path = []) {
    const count = value.readUInt16LE(offset + 12) + value.readUInt16LE(offset + 14);
    for (let index = 0; index < count; index++) {
      const entry = offset + 16 + index * 8;
      const id = value.readUInt32LE(entry);
      const target = value.readUInt32LE(entry + 4);
      if (target & 0x80000000) directory(base + (target & 0x7fffffff), [...path, id]);
      else {
        const data = base + target;
        const start = fileOffset(value.readUInt32LE(data));
        resources.push({ path: [...path, id], data: value.subarray(start, start + value.readUInt32LE(data + 4)) });
      }
    }
  }
  directory(base);
  const ico = readFileSync(join(client, 'resources/icon.ico'));
  const expected = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
    const offset = 6 + index * 16;
    const start = ico.readUInt32LE(offset + 12);
    return { width: ico[offset] || 256, height: ico[offset + 1] || 256,
      bytes: ico.readUInt32LE(offset + 8), sha256: sha256(ico.subarray(start, start + ico.readUInt32LE(offset + 8))) };
  });
  const groups = resources.filter(resource => resource.path[0] === 14);
  assert.ok(groups.length, 'No Windows icon group embedded');
  const reports = groups.map(group => {
    assert.equal(group.data.readUInt16LE(2), 1);
    assert.equal(group.data.readUInt16LE(4), expected.length);
    const seen = new Set();
    const sizes = Array.from({ length: group.data.readUInt16LE(4) }, (_, index) => {
      const offset = 6 + index * 14;
      const width = group.data[offset] || 256;
      const height = group.data[offset + 1] || 256;
      const frame = expected.find(frame => frame.width === width && frame.height === height);
      assert.ok(frame, `Unexpected embedded icon size ${width}x${height}`);
      assert.ok(!seen.has(width), `Duplicate embedded icon size ${width}`);
      seen.add(width);
      const iconId = group.data.readUInt16LE(offset + 12);
      const icon = resources.find(resource => resource.path[0] === 3 && resource.path[1] === iconId && resource.path[2] === group.path[2]);
      assert.ok(icon, `Missing Windows icon frame ${iconId}`);
      assert.equal(icon.data.length, frame.bytes);
      assert.equal(sha256(icon.data), frame.sha256);
      return frame.width;
    });
    return sizes.sort((a, b) => a - b);
  });
  return { icoSha256: fileHash(join(client, 'resources/icon.ico')), embeddedFramesMatch: true, groups: reports };
}

const branding = ['icon.png', 'trayTemplate.png', 'trayTemplate@2x.png'];
const brandHashes = Object.fromEntries(branding.map(file => [file, fileHash(join(client, 'resources', file))]));
function checkBranding(directory) {
  for (const file of branding) assert.equal(fileHash(join(directory, file)), brandHashes[file], `Branding mismatch: ${directory}/${file}`);
  return brandHashes;
}
// Optional synthetic sentinel IDs only. Never discover or read a user's notebook.
const privateIdFile = process.env.MISTNOTES_PRIVATE_ID_FILE;
const suppliedIds = privateIdFile ? JSON.parse(readFileSync(resolve(privateIdFile), 'utf8')) : [];
assert.ok(Array.isArray(suppliedIds) && suppliedIds.length <= 10_000 && suppliedIds.every(id => typeof id === 'string' && id.length > 10 && id.length <= 256),
  'MISTNOTES_PRIVATE_ID_FILE must contain a JSON array of synthetic sentinel IDs');
const privateIds = new Set(suppliedIds);
function verifyAsar(path) {
  const entries = listPackage(path).filter(name => !('files' in statFile(path, name.replace(/^\//, ''))));
  const forbiddenFiles = entries.filter(name => /(?:^|\/)(?:notes(?:\.previous)?\.json|ai-credentials\.json|\.env(?:\.[^/]*)?|[^/]+\.(?:key|p12|pfx)|backups?|qa-v2|verification|userData)(?:\/|$)/i.test(name));
  assert.deepEqual(forbiddenFiles, []);
  const raw = readFileSync(path);
  const syntheticSentinelIdsFound = [...privateIds].filter(id => raw.includes(Buffer.from(id))).length;
  assert.equal(syntheticSentinelIdsFound, 0);
  for (const name of ['main', 'preload']) assert.equal(sha256(extractFile(path, `dist-electron/${name}.cjs`)), fileHash(join(client, `dist-electron/${name}.cjs`)));
  const rendererFiles = walk(join(client, 'dist')).filter(file => !file.endsWith('.map'));
  for (const file of rendererFiles) assert.equal(sha256(extractFile(path, relative(client, file))), fileHash(file));
  const packaged = JSON.parse(extractFile(path, 'package.json').toString('utf8'));
  assert.equal(packaged.version, version);
  return { path: relative(client, path), files: entries.length, version, forbiddenFiles,
    syntheticSentinelIdsChecked: privateIds.size, syntheticSentinelIdsFound,
    mainMatchesFrozenBuild: true, preloadMatchesFrozenBuild: true, mainSha256: fileHash(join(client, 'dist-electron/main.cjs')),
    rendererMatchesFrozenBuild: true, rendererFiles: rendererFiles.length, asarSha256: fileHash(path) };
}
const macReports = [];
for (const arch of ['arm64', 'x64']) {
  const filename = `MistNotes-${version}-mac-${arch}.dmg`;
  const dmg = join(release, filename);
  exec('hdiutil', ['verify', dmg]);
  const mountpoint = mkdtempSync(join(tmpdir(), `mist-release-${arch}-`));
  let mounted = false;
  try {
    exec('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountpoint, dmg]);
    mounted = true;
    const app = join(mountpoint, '雾笺.app');
    const info = JSON.parse(exec('plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')]));
    assert.equal(info.CFBundleIdentifier, 'local.mistnotes.desktop.v2');
    assert.equal(info.CFBundleShortVersionString, version);
    const description = exec('file', [join(app, 'Contents/MacOS/雾笺')]);
    assert.ok(description.includes(arch === 'x64' ? 'x86_64' : 'arm64'));
    exec('codesign', ['--verify', '--deep', '--strict', app]);
    const signature = spawnSync('codesign', ['-dv', '--verbose=4', app], { encoding: 'utf8' });
    assert.equal(signature.status, 0);
    assert.ok(signature.stderr.includes('Signature=adhoc'));
    assert.equal(readlinkSync(join(mountpoint, 'Applications')), '/Applications');
    const resourceHashes = checkBranding(join(app, 'Contents/Resources/branding'));
    const appIconSha256 = fileHash(join(app, 'Contents/Resources/icon.icns'));
    assert.equal(appIconSha256, fileHash(join(client, 'resources/icon.icns')));
    const unpacked = join(release, arch === 'arm64' ? 'mac-arm64' : 'mac', '雾笺.app/Contents/Resources/app.asar');
    assert.equal(fileHash(join(app, 'Contents/Resources/app.asar')), fileHash(unpacked));
    macReports.push({ file: filename, dmgChecksumVerified: true, readonlyMounted: true, bundleId: info.CFBundleIdentifier,
      version, architecture: arch, machOArchitectureVerified: true, deepStrictCodesignVerified: true,
      adHoc: true, applicationsShortcut: true, asarMatchesUnpacked: true, appIconMatchesReviewedIcns: true, appIconSha256, branding: resourceHashes });
  } finally {
    if (mounted) exec('hdiutil', ['detach', mountpoint]);
    rmSync(mountpoint, { recursive: true });
  }
}

const sevenCache = join(homedir(), 'Library/Caches/electron-builder/7zip@1.0.0');
const seven = process.env.MISTNOTES_7ZZ || walk(sevenCache).find(file => file.endsWith('/bin/7zz'));
assert.ok(seven, '7zz not found');
const windowsReports = [];
for (const kind of ['setup', 'portable']) {
  const filename = `MistNotes-${version}-windows-x64-${kind}.exe`;
  const installer = join(release, filename);
  const listing = exec(seven, ['l', '-slt', installer]);
  assert.ok(listing.includes('Type = Nsis'));
  exec(seven, ['t', installer]);
  const temp = mkdtempSync(join(tmpdir(), `mist-release-${kind}-`));
  try {
    exec(seven, ['e', '-y', `-o${temp}`, installer, '$PLUGINSDIR/app-64.7z']);
    const payload = join(temp, 'app-64.7z');
    assert.ok(existsSync(payload));
    exec(seven, ['t', payload]);
    const expanded = join(temp, 'payload');
    exec(seven, ['x', '-y', `-o${expanded}`, payload]);
    const inner = pe(join(expanded, '雾笺.exe'));
    const icons = verifyWindowsIcons(join(expanded, '雾笺.exe'));
    assert.equal(inner.architecture, 'x64');
    const wrapper = pe(installer);
    const installerIcons = verifyWindowsIcons(installer);
    assert.equal(wrapper.architecture, 'x86');
    const unpacked = join(release, 'win-unpacked');
    const unpackedFiles = walk(unpacked);
    for (const file of unpackedFiles) {
      const name = relative(unpacked, file);
      assert.equal(fileHash(join(expanded, name)), fileHash(file), `Windows payload mismatch: ${name}`);
    }
    assert.equal(walk(expanded).length, unpackedFiles.length);
    const resourceHashes = checkBranding(join(expanded, 'resources/branding'));
    windowsReports.push({ file: filename, wrapper, installerIcons, container: 'NSIS', embeddedPayloadArchiveVerified: true,
      payloadExecutable: inner, icons, payloadMatchesWinUnpacked: true, payloadComparedFiles: unpackedFiles.length,
      containsUninstaller: /Path = .*Uninstall 雾笺\.exe/.test(listing),
      asarSha256: fileHash(join(expanded, 'resources/app.asar')), branding: resourceHashes,
      runtimeTest: 'pending-no-Windows-host' });
    assert.equal(windowsReports.at(-1).containsUninstaller, kind === 'setup');
  } finally { rmSync(temp, { recursive: true }); }
}
const asarReports = [
  join(release, 'mac-arm64/雾笺.app/Contents/Resources/app.asar'),
  join(release, 'mac/雾笺.app/Contents/Resources/app.asar'),
  join(release, 'win-unpacked/resources/app.asar'),
].map(verifyAsar);
assert.equal(new Set(asarReports.map(report => report.asarSha256)).size, 1, 'Cross-platform app logic differs');
const artifactNames = [...macReports, ...windowsReports].map(report => report.file);
const artifacts = artifactNames.map(file => ({ file, bytes: statSync(join(release, file)).size, sha256: fileHash(join(release, file)) }));
for (const [file, data] of [['macos-verification.json', macReports], ['windows-verification.json', windowsReports], ['asar-verification.json', asarReports], ['artifact-manifest.json', { version, generatedAt: now, published: false, resourceRevision: 'color-cycle-one-click-ai-2026-10-25', artifacts }]]) {
  writeFileSync(join(release, file), `${JSON.stringify(data, null, 2)}\n`);
}
writeFileSync(join(release, 'SHA256SUMS.txt'), artifacts.map(artifact => `${artifact.sha256}  ${artifact.file}`).join('\n') + '\n');
console.log(JSON.stringify({ version, artifacts, macChecks: macReports.length, windowsStaticChecks: windowsReports.length,
  windowsRuntime: 'pending-no-Windows-host', commonAsarSha256: asarReports[0].asarSha256, branding: brandHashes }, null, 2));
