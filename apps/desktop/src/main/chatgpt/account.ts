import { PLAN_SCOPE, refresh, revoke, signIn, SignInError, type Credentials, type SignInOptions } from './oauth';
import type { SecretStore } from '../credentials/secretStore';

/** Credential-store names: the token set, and the account → client mapping kept after sign-out. */
const TOKENS = 'chatgpt/tokens';
const CLIENT = 'chatgpt/client';
/** Renew this long before the access token expires. */
const REFRESH_MARGIN_MS = 2 * 60 * 1000;
const UNUSABLE_REFRESH = /invalid_grant|invalid_refresh_token|token_expired|refresh_token_(expired|invalidated|reused)/;

export type ChatGptState = 'signedOut' | 'signingIn' | 'signedIn' | 'planDisabled';

export interface ChatGptStatus {
  state: ChatGptState;
  /** The signed-in account's e-mail, shown to the user only; never logged. */
  email?: string;
  detail?: string;
}

export interface AccountOptions {
  store: SecretStore;
  hostId: () => string;
  openBrowser: (url: string) => Promise<void>;
  fetch?: typeof fetch;
  /** OpenAI's key set; discovered from auth.openai.com when absent (tests pass a local one). */
  jwks?: SignInOptions['jwks'];
  onStatus(status: ChatGptStatus): void;
  /** Diagnostics for the log file; never receives tokens or account data. */
  log?: (message: string) => void;
}

/**
 * The ChatGPT account used for plan usage (ADR 0015). Tokens live only in the Windows credential
 * store; this class hands out a fresh access token and renews it near expiry, one renewal at a time.
 */
export class ChatGptAccount {
  private credentials: Credentials | null = null;
  private current: ChatGptStatus = { state: 'signedOut' };
  private renewing: Promise<Credentials> | null = null;
  /** The sign-in waiting for the browser; a new sign-in replaces it (issue #445). */
  private pending: AbortController | null = null;

  constructor(private readonly options: AccountOptions) {}

  load(): ChatGptStatus {
    const raw = this.options.store.read(TOKENS);
    this.credentials = raw ? (JSON.parse(raw) as Credentials) : null;
    this.publish();
    return this.current;
  }

  status(): ChatGptStatus {
    return this.current;
  }

  async signIn(): Promise<ChatGptStatus> {
    this.pending?.abort();
    const attempt = new AbortController();
    this.pending = attempt;
    const saved = this.savedClient();
    this.log(`ChatGPT sign-in started (${saved ? 'returning registration' : 'new registration'})`);
    this.set({ state: 'signingIn' });
    try {
      const credentials = await signIn({
        hostId: this.options.hostId(),
        clientId: saved?.clientId,
        idTokenHint: saved?.idToken,
        openBrowser: this.options.openBrowser,
        signal: attempt.signal,
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
        ...(this.options.jwks ? { jwks: this.options.jwks } : {}),
      });
      // A returning sign-in must be the same account as the saved registration.
      if (saved && saved.subject !== credentials.subject) throw new SignInError('a different ChatGPT account signed in', 'invalid');
      this.save(credentials);
      this.log('ChatGPT sign-in succeeded');
      this.publish();
    } catch (error) {
      // A replaced attempt leaves the status to the attempt that replaced it.
      if (attempt.signal.aborted) {
        this.log('ChatGPT sign-in replaced by a new attempt');
        return this.current;
      }
      const message = error instanceof Error ? error.message : String(error);
      // A returning sign-in that failed forgets the registration, so the next attempt registers afresh.
      if (saved) this.options.store.remove(CLIENT);
      this.log(`Warning: ChatGPT sign-in failed (${error instanceof SignInError ? error.kind : 'error'}): ${message}`);
      this.publish(`Sign-in failed: ${message}. Continue with ChatGPT starts a new sign-in.`);
    } finally {
      if (this.pending === attempt) this.pending = null;
    }
    return this.current;
  }

  async signOut(): Promise<ChatGptStatus> {
    this.pending?.abort();
    const credentials = this.credentials;
    this.credentials = null;
    this.options.store.remove(TOKENS);
    // Revoking ends this registration at OpenAI; the next sign-in starts a fresh one (issue #445).
    this.options.store.remove(CLIENT);
    const confirmed = credentials ? await revoke(credentials, this.options.fetch) : true;
    this.log(`ChatGPT signed out (revocation ${confirmed ? 'confirmed' : 'not confirmed'})`);
    this.publish(confirmed ? undefined : 'signed out here; OpenAI did not confirm the revocation, disconnect PartBuddy in ChatGPT settings');
    return this.current;
  }

  /** A valid access token for plan usage, renewed if it expires within two minutes. */
  async accessToken(): Promise<string> {
    const credentials = this.credentials;
    if (!credentials) throw new Error('not signed in to ChatGPT');
    if (!credentials.scopes.includes(PLAN_SCOPE)) throw new Error('ChatGPT plan usage is not enabled for PartBuddy');
    if (credentials.expiresAt - REFRESH_MARGIN_MS > Date.now()) return credentials.accessToken;
    this.renewing ??= refresh(credentials, this.options.fetch).finally(() => {
      this.renewing = null;
    });
    try {
      const renewed = await this.renewing;
      this.save(renewed);
      return renewed.accessToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (UNUSABLE_REFRESH.test(message)) {
        this.credentials = null;
        this.options.store.remove(TOKENS);
        this.publish('the ChatGPT session ended; sign in again');
      }
      throw error;
    }
  }

  private save(credentials: Credentials): void {
    this.credentials = credentials;
    this.options.store.write(TOKENS, JSON.stringify(credentials));
    this.options.store.write(CLIENT, JSON.stringify({ clientId: credentials.clientId, subject: credentials.subject, idToken: credentials.idToken }));
  }

  private savedClient(): { clientId: string; subject: string; idToken: string } | null {
    const raw = this.options.store.read(CLIENT);
    return raw ? (JSON.parse(raw) as { clientId: string; subject: string; idToken: string }) : null;
  }

  private publish(detail?: string): void {
    const credentials = this.credentials;
    let status: ChatGptStatus;
    if (!credentials) status = { state: 'signedOut' };
    else status = { state: credentials.scopes.includes(PLAN_SCOPE) ? 'signedIn' : 'planDisabled' };
    if (credentials?.email) status.email = credentials.email;
    if (detail) status.detail = detail.slice(0, 500);
    this.set(status);
  }

  private log(message: string): void {
    this.options.log?.(message);
  }

  private set(status: ChatGptStatus): void {
    this.current = status;
    this.options.onStatus(status);
  }
}
