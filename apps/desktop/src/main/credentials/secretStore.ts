import { Entry } from '@napi-rs/keyring';

/**
 * Secrets in the Windows credential store (ADR 0011), through `@napi-rs/keyring`. One credential
 * holds at most 2560 bytes, less than an OAuth token set, so a secret is split into chunks
 * `<name>#0 … #n` with a small manifest under `<name>`.
 */

export interface SecretBackend {
  get(account: string): Uint8Array | null;
  set(account: string, value: Uint8Array): void;
  delete(account: string): void;
}

/**
 * Service name of every PartBuddy credential (target "PartBuddy/<account>" in Windows). Tests use
 * their own service so they never see the user's sign-ins.
 */
const SERVICE = process.env.PARTBUDDY_KEYRING_SERVICE ?? 'PartBuddy';
const CHUNK_BYTES = 2400;

export const keyringBackend: SecretBackend = {
  get(account) {
    try {
      const secret = new Entry(SERVICE, account).getSecret();
      return secret ? new Uint8Array(secret) : null;
    } catch {
      return null;
    }
  },
  set(account, value) {
    new Entry(SERVICE, account).setSecret(Buffer.from(value));
  },
  delete(account) {
    try {
      new Entry(SERVICE, account).deleteCredential();
    } catch {
      // Already gone.
    }
  },
};

export class SecretStore {
  constructor(private readonly backend: SecretBackend = keyringBackend) {}

  write(name: string, value: string): void {
    const bytes = Buffer.from(value, 'utf8');
    const count = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
    const previous = this.chunkCount(name);
    for (let i = 0; i < count; i += 1) {
      this.backend.set(`${name}#${i}`, bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES));
    }
    for (let i = count; i < previous; i += 1) this.backend.delete(`${name}#${i}`);
    this.backend.set(name, Buffer.from(JSON.stringify({ chunks: count }), 'utf8'));
  }

  read(name: string): string | null {
    const count = this.chunkCount(name);
    if (count === 0) return null;
    const parts: Buffer[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = this.backend.get(`${name}#${i}`);
      if (!part) return null;
      parts.push(Buffer.from(part));
    }
    return Buffer.concat(parts).toString('utf8');
  }

  remove(name: string): void {
    const count = this.chunkCount(name);
    for (let i = 0; i < count; i += 1) this.backend.delete(`${name}#${i}`);
    this.backend.delete(name);
  }

  private chunkCount(name: string): number {
    const manifest = this.backend.get(name);
    if (!manifest) return 0;
    try {
      const parsed = JSON.parse(Buffer.from(manifest).toString('utf8')) as { chunks?: unknown };
      return typeof parsed.chunks === 'number' && Number.isInteger(parsed.chunks) && parsed.chunks > 0 ? parsed.chunks : 0;
    } catch {
      return 0;
    }
  }
}

/** In-memory backend with the same size limit, for tests. */
export function memoryBackend(): SecretBackend & { entries: Map<string, Uint8Array> } {
  const entries = new Map<string, Uint8Array>();
  return {
    entries,
    get: (account) => entries.get(account) ?? null,
    set: (account, value) => {
      if (value.length > 2560) throw new Error('longer than the platform limit of 2560');
      entries.set(account, Uint8Array.from(value));
    },
    delete: (account) => {
      entries.delete(account);
    },
  };
}
