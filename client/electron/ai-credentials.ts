import { randomUUID } from 'node:crypto';
import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync,
  readFileSync, renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { AI_MODEL, AI_MODEL_LABEL, type AICredentialStatus } from '../src/shared/ai';
import { AIServiceError } from './ai';

/** Inject Electron safeStorage in main; renderer code must never import this module. */
export interface AISafeStorage {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
  getSelectedStorageBackend?(): string;
}

const MAX_CREDENTIAL_BYTES = 16 * 1024;

export function validateAPIKey(value: unknown): string {
  if (typeof value !== 'string') throw new AIServiceError('invalid_input');
  const key = value.trim();
  if (key.length < 16 || key.length > 512 || /[^\x21-\x7e]/.test(key)) {
    throw new AIServiceError('invalid_input', '请填写有效的 DeepSeek API 密钥。');
  }
  return key;
}

/** Encrypted, independent of notebook data and all notebook import/export paths. */
export class AICredentialStore {
  readonly file: string;
  private operations: Promise<void> = Promise.resolve();

  constructor(
    private readonly directory: string,
    private readonly secureStorage: AISafeStorage,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    this.file = join(directory, 'ai-credentials.json');
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }

  private async canStore(): Promise<boolean> {
    try {
      if (!await this.secureStorage.isAsyncEncryptionAvailable()) return false;
      if (this.platform === 'linux') {
        const backend = this.secureStorage.getSelectedStorageBackend?.();
        // Refuse plaintext, unknown, and missing keyring backends.
        if (!['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(backend ?? '')) return false;
      }
      return true;
    } catch { return false; }
  }

  private async statusUnlocked(): Promise<AICredentialStatus> {
    const canStore = await this.canStore();
    return {
      configured: existsSync(this.file), canStore,
      model: AI_MODEL, label: AI_MODEL_LABEL,
    };
  }

  status(): Promise<AICredentialStatus> {
    return this.serialize(() => this.statusUnlocked());
  }

  private writeEncrypted(encrypted: Buffer): void {
    const temporary = join(this.directory, `.ai-credentials-${randomUUID()}.tmp`);
    let descriptor: number | undefined;
    try {
      if (!Buffer.isBuffer(encrypted) || encrypted.length === 0 || encrypted.length > 8192) {
        throw new Error('Invalid encrypted credential');
      }
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      descriptor = openSync(temporary, 'wx', 0o600);
      writeFileSync(descriptor, JSON.stringify({ version: 1, encryptedKey: encrypted.toString('base64') }));
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporary, this.file);
      chmodSync(this.file, 0o600);
    } finally {
      if (descriptor !== undefined) { try { closeSync(descriptor); } catch { /* No secret logs. */ } }
      if (existsSync(temporary)) { try { unlinkSync(temporary); } catch { /* Preserve safe error above. */ } }
    }
  }

  save(value: unknown): Promise<AICredentialStatus> {
    return this.serialize(async () => {
      const key = validateAPIKey(value);
      if (!await this.canStore()) throw new AIServiceError('secure_storage_unavailable');
      try {
        this.writeEncrypted(await this.secureStorage.encryptStringAsync(key));
        return { configured: true, canStore: true, model: AI_MODEL, label: AI_MODEL_LABEL };
      } catch {
        throw new AIServiceError('credential_error', '密钥未能安全保存，请重试。');
      }
    });
  }

  delete(): Promise<AICredentialStatus> {
    return this.serialize(async () => {
      try { if (existsSync(this.file)) unlinkSync(this.file); }
      catch { throw new AIServiceError('credential_error', '未能删除密钥，请重试。'); }
      return this.statusUnlocked();
    });
  }

  /** Main-process-only access; never return its result through IPC. */
  readKey(): Promise<string | null> {
    return this.serialize(async () => {
      if (!existsSync(this.file)) return null;
      if (!await this.canStore()) throw new AIServiceError('secure_storage_unavailable');
      try {
        if (!existsSync(this.file)) return null;
        if (statSync(this.file).size > MAX_CREDENTIAL_BYTES) throw new Error('Credential file too large');
        const original = readFileSync(this.file, 'utf8');
        const record: unknown = JSON.parse(original);
        if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid credential');
        const { version, encryptedKey } = record as Record<string, unknown>;
        if (version !== 1 || typeof encryptedKey !== 'string' || encryptedKey.length === 0
          || encryptedKey.length > 12_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encryptedKey)) {
          throw new Error('Invalid credential');
        }
        // Async safeStorage accepts the ciphertext saved by the former sync API.
        const decrypted = await this.secureStorage.decryptStringAsync(Buffer.from(encryptedKey, 'base64'));
        if (!decrypted || typeof decrypted.shouldReEncrypt !== 'boolean') throw new Error('Invalid decrypt result');
        const key = validateAPIKey(decrypted.result);
        const unchanged = () => existsSync(this.file) && readFileSync(this.file, 'utf8') === original;
        if (!unchanged()) return null;
        if (decrypted.shouldReEncrypt) {
          const encrypted = await this.secureStorage.encryptStringAsync(key);
          // Also protect against out-of-process file replacement while awaiting Keychain.
          if (!unchanged()) return null;
          this.writeEncrypted(encrypted);
        }
        return key;
      } catch {
        throw new AIServiceError('credential_error', '无法读取已保存的密钥，请在 AI 设置中重新保存。');
      }
    });
  }
}
