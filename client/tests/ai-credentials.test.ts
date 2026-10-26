import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AICredentialStore, type AISafeStorage } from '../electron/ai-credentials';
import { AIServiceError } from '../electron/ai';
import { AI_MODEL } from '../src/shared/ai';

const secret = 'sk-test-only-credential-0123456789';
const encrypt = (value: string) => Buffer.from(Buffer.from(value, 'utf8').map(byte => byte ^ 0x5a));
const decrypt = (value: Buffer) => Buffer.from(value.map(byte => byte ^ 0x5a)).toString('utf8');
const secure: AISafeStorage = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async value => encrypt(value),
  decryptStringAsync: async value => ({ result: decrypt(value), shouldReEncrypt: false }),
  getSelectedStorageBackend: () => 'gnome_libsecret',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function encoded(value: string) {
  return JSON.stringify({ version: 1, encryptedKey: encrypt(value).toString('base64') });
}

test('async storage saves only encrypted credentials in an independent 0600 file with replacement and deletion', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mist-ai-key-test-'));
  try {
    const store = new AICredentialStore(directory, secure);
    assert.deepEqual(await store.status(), { configured: false, canStore: true, model: AI_MODEL, label: 'DeepSeek V4.1 Flash · 1017' });
    const status = await store.save(` ${secret} `);
    assert.equal(status.configured, true);
    assert.ok(!JSON.stringify(status).includes(secret));
    const disk = readFileSync(store.file, 'utf8');
    assert.ok(!disk.includes(secret));
    assert.deepEqual(Object.keys(JSON.parse(disk)).sort(), ['encryptedKey', 'version']);
    assert.equal(await store.readKey(), secret);
    if (process.platform !== 'win32') assert.equal(statSync(store.file).mode & 0o777, 0o600);
    await store.save(`${secret}-replacement`);
    assert.equal(await store.readKey(), `${secret}-replacement`);
    assert.deepEqual(readdirSync(directory), ['ai-credentials.json']);
    assert.equal((await store.delete()).configured, false);
    assert.equal(await store.readKey(), null);
    assert.deepEqual(readdirSync(directory), []);
  } finally { rmSync(directory, { recursive: true }); }
});

test('Mac remains available when the legacy sync API says false but async Keychain works', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mist-ai-key-test-'));
  try {
    let syncCalls = 0;
    const hybrid = {
      ...secure,
      isEncryptionAvailable: () => { syncCalls++; return false; },
      encryptString: () => { syncCalls++; throw new Error('Do not call sync encryption'); },
      decryptString: () => { syncCalls++; throw new Error('Do not call sync decryption'); },
    };
    const store = new AICredentialStore(directory, hybrid, 'darwin');
    assert.equal((await store.status()).canStore, true);
    assert.equal((await store.save(secret)).configured, true);
    assert.equal(await store.readKey(), secret);
    assert.equal(syncCalls, 0);
  } finally { rmSync(directory, { recursive: true }); }
});

test('refuses unavailable async encryption and Linux plaintext, unknown or missing backends', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mist-ai-key-test-'));
  try {
    for (const [backend, platform] of [
      [{ ...secure, isAsyncEncryptionAvailable: async () => false }, 'darwin'],
      [{ ...secure, isAsyncEncryptionAvailable: async () => { throw new Error(secret); } }, 'darwin'],
      [{ ...secure, getSelectedStorageBackend: () => 'basic_text' }, 'linux'],
      [{ ...secure, getSelectedStorageBackend: () => 'unknown' }, 'linux'],
      [{ ...secure, getSelectedStorageBackend: undefined }, 'linux'],
    ] as [AISafeStorage, NodeJS.Platform][]) {
      const store = new AICredentialStore(directory, backend, platform);
      assert.equal((await store.status()).canStore, false);
      await assert.rejects(store.save(secret), (error: unknown) => error instanceof AIServiceError
        && error.code === 'secure_storage_unavailable' && !error.message.includes(secret));
      assert.deepEqual(readdirSync(directory), []);
    }
  } finally { rmSync(directory, { recursive: true }); }
});

test('reads existing version 1 sync ciphertext using async decryption and rotates when requested', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mist-ai-key-test-'));
  try {
    const legacy = encoded(secret);
    const normal = new AICredentialStore(directory, secure, 'darwin');
    writeFileSync(normal.file, legacy);
    assert.equal(await normal.readKey(), secret);
    assert.equal(readFileSync(normal.file, 'utf8'), legacy, 'no rewrite unless rotation is requested');
    let rotations = 0;
    const store = new AICredentialStore(directory, {
      ...secure,
      decryptStringAsync: async value => ({ result: decrypt(value), shouldReEncrypt: true }),
      encryptStringAsync: async value => { rotations++; return Buffer.concat([Buffer.from('rotated:'), encrypt(value)]); },
    }, 'darwin');
    assert.equal(await store.readKey(), secret);
    const rotated = JSON.parse(readFileSync(store.file, 'utf8'));
    assert.equal(rotations, 1);
    assert.equal(rotated.version, 1);
    assert.ok(Buffer.from(rotated.encryptedKey, 'base64').subarray(0, 8).equals(Buffer.from('rotated:')));
    assert.ok(!readFileSync(store.file, 'utf8').includes(secret));
    if (process.platform !== 'win32') assert.equal(statSync(store.file).mode & 0o777, 0o600);
  } finally { rmSync(directory, { recursive: true }); }
});

test('serializes async reads, replacements and deletion so rotation cannot restore a deleted key', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mist-ai-key-test-'));
  try {
    const started = deferred<void>();
    const decrypted = deferred<{ result: string; shouldReEncrypt: boolean }>();
    const store = new AICredentialStore(directory, {
      ...secure,
      decryptStringAsync: async () => { started.resolve(); return decrypted.promise; },
    }, 'darwin');
    writeFileSync(store.file, encoded(secret));
    const reading = store.readKey();
    await started.promise;
    const replacing = store.save(`${secret}-latest`);
    const deleting = store.delete();
    decrypted.resolve({ result: secret, shouldReEncrypt: true });
    assert.equal(await reading, secret);
    await replacing;
    assert.equal((await deleting).configured, false);
    assert.equal(existsSync(store.file), false);
    assert.equal(await store.readKey(), null);
    await store.save(`${secret}-new`);
    assert.equal((await store.status()).configured, true);
    assert.equal(decrypt(Buffer.from(JSON.parse(readFileSync(store.file, 'utf8')).encryptedKey, 'base64')), `${secret}-new`);
    assert.deepEqual(readdirSync(directory), ['ai-credentials.json']);
  } finally { rmSync(directory, { recursive: true }); }
});

test('rotation skips writing if the file is externally replaced or deleted while encryption awaits', async () => {
  for (const replacement of [encoded(`${secret}-other`), null]) {
    const directory = mkdtempSync(join(tmpdir(), 'mist-ai-key-test-'));
    try {
      const started = deferred<void>();
      const encrypted = deferred<Buffer>();
      const store = new AICredentialStore(directory, {
        ...secure,
        decryptStringAsync: async () => ({ result: secret, shouldReEncrypt: true }),
        encryptStringAsync: async () => { started.resolve(); return encrypted.promise; },
      }, 'darwin');
      writeFileSync(store.file, encoded(secret));
      const reading = store.readKey();
      await started.promise;
      if (replacement === null) unlinkSync(store.file); else writeFileSync(store.file, replacement);
      encrypted.resolve(encrypt(secret));
      assert.equal(await reading, null);
      if (replacement === null) assert.equal(existsSync(store.file), false);
      else assert.equal(readFileSync(store.file, 'utf8'), replacement);
      assert.ok(readdirSync(directory).every(file => !file.endsWith('.tmp')));
    } finally { rmSync(directory, { recursive: true }); }
  }
});

test('invalid keys, async encrypt/decrypt failures and corrupt files never expose secret diagnostics', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mist-ai-key-test-'));
  try {
    const store = new AICredentialStore(directory, secure);
    for (const value of [null, 2, '', 'short', `ab cd${secret}`, `${secret}\nmore`, 'x'.repeat(513)]) {
      await assert.rejects(store.save(value), (error: unknown) => error instanceof AIServiceError && !error.message.includes(secret));
    }
    const failing = new AICredentialStore(directory, { ...secure, encryptStringAsync: async () => { throw new Error(secret); } });
    await assert.rejects(failing.save(secret), (error: unknown) => error instanceof AIServiceError && !error.message.includes(secret));
    assert.deepEqual(readdirSync(directory), []);
    for (const contents of ['{broken', JSON.stringify({ version: 2, encryptedKey: secret }), JSON.stringify({ version: 1, encryptedKey: '%%%invalid' })]) {
      writeFileSync(store.file, contents);
      await assert.rejects(store.readKey(), (error: unknown) => error instanceof AIServiceError
        && error.code === 'credential_error' && !error.message.includes(secret));
      assert.equal(readFileSync(store.file, 'utf8'), contents);
    }
    writeFileSync(store.file, encoded(secret));
    const badDecrypt = new AICredentialStore(directory, { ...secure, decryptStringAsync: async () => { throw new Error(secret); } });
    await assert.rejects(badDecrypt.readKey(), (error: unknown) => error instanceof AIServiceError && !error.message.includes(secret));
    assert.equal((await store.delete()).configured, false);
  } finally { rmSync(directory, { recursive: true }); }
});
