import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname } from 'node:path';

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/**
 * Sign in with ChatGPT for open-source apps (ADR 0015; OpenAI "Registration and sign-in"):
 * OIDC with PKCE on a 127.0.0.1 loopback callback, dynamic client registration on first sign-in,
 * no client secret. The ID token is verified against OpenAI's JWKS before anything is stored.
 */

export const ISSUER = 'https://auth.openai.com';
const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`;
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
export const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const AGENT_NAME = 'PartBuddy';
const CALLBACK_PATH = '/auth/callback';
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000;

export interface Credentials {
  clientId: string;
  subject: string;
  email: string | null;
  idToken: string;
  accessToken: string;
  refreshToken: string;
  /** Expiry of the access token, milliseconds since the epoch. */
  expiresAt: number;
  scopes: string[];
}

export class SignInError extends Error {
  constructor(
    message: string,
    readonly kind: 'declined' | 'timeout' | 'invalid' | 'network',
  ) {
    super(message);
    this.name = 'SignInError';
  }
}

/** Opaque, stable identifier of this installation (`urn:uuid:…`), created before the first sign-in. */
export function hostId(file: string): string {
  if (existsSync(file)) {
    const stored = readFileSync(file, 'utf8').trim();
    if (/^urn:uuid:[0-9a-f-]{36}$/.test(stored)) return stored;
  }
  const id = `urn:uuid:${randomUUID()}`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${id}\n`, { mode: 0o600 });
  return id;
}

const base64url = (bytes: Buffer) => bytes.toString('base64url');

export interface SignInOptions {
  hostId: string;
  /** Issued client ID of an earlier registration of this account; absent on first sign-in. */
  clientId?: string | undefined;
  idTokenHint?: string | undefined;
  /** Opens the system browser (Electron's shell.openExternal). */
  openBrowser: (url: string) => Promise<void>;
  fetch?: typeof fetch;
  /** OpenID configuration, injectable for tests. */
  jwks?: Parameters<typeof jwtVerify>[1];
}

interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  id_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
}

const PAGE = (title: string) =>
  `<!doctype html><meta charset="utf-8"><title>PartBuddy</title><body style="font-family:system-ui,sans-serif;padding:3rem"><p>${title}</p></body>`;

export async function signIn(options: SignInOptions): Promise<Credentials> {
  const doFetch = options.fetch ?? fetch;
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(24));
  const nonce = base64url(randomBytes(24));

  // Start the loopback listener before the browser opens; only the port may vary between sign-ins.
  let finish: (value: URLSearchParams) => void = () => undefined;
  const callback = new Promise<URLSearchParams>((resolve) => {
    finish = resolve;
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== CALLBACK_PATH || url.searchParams.get('state') !== state) {
      response.writeHead(404).end();
      return;
    }
    const declined = url.searchParams.has('error');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(PAGE(declined ? 'Sign-in was cancelled. You can close this window.' : 'Signed in to PartBuddy. You can close this window.'));
    finish(url.searchParams);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}${CALLBACK_PATH}`;
  const clientId = options.clientId ?? 'dynamic_agent_client';

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ext_agent_host_id: options.hostId,
  });
  if (!options.clientId) params.set('agent_name_hint', AGENT_NAME);
  if (options.idTokenHint) params.set('id_token_hint', options.idTokenHint);

  let result: URLSearchParams;
  try {
    await options.openBrowser(`${AUTHORIZE_URL}?${params.toString()}`);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new SignInError('sign-in was not completed in time', 'timeout'));
      }, SIGN_IN_TIMEOUT_MS).unref(),
    );
    result = await Promise.race([callback, timeout]);
  } finally {
    server.close();
  }

  if (result.has('error')) throw new SignInError(`sign-in declined (${result.get('error') ?? ''})`, 'declined');
  const code = result.get('code');
  // A new registration returns the issued client ID; a returning one keeps the saved ID.
  const issuedClientId = options.clientId ?? result.get('client_id');
  if (!code || !issuedClientId || issuedClientId === 'dynamic_agent_client') {
    throw new SignInError('sign-in returned no code or client ID', 'invalid');
  }
  if (options.clientId && result.has('client_id') && result.get('client_id') !== options.clientId) {
    throw new SignInError('sign-in returned a different client ID', 'invalid');
  }

  const tokens = await postForm(doFetch, TOKEN_URL, {
    grant_type: 'authorization_code',
    client_id: issuedClientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    resource: RESOURCE,
  });
  return toCredentials(tokens, issuedClientId, nonce, options.jwks ?? (await jwksFor(doFetch)));
}

/** Renews the access token; the refresh token rotates, so the whole set is replaced. */
export async function refresh(credentials: Credentials, doFetch: typeof fetch = fetch): Promise<Credentials> {
  const tokens = await postForm(doFetch, TOKEN_URL, {
    grant_type: 'refresh_token',
    client_id: credentials.clientId,
    refresh_token: credentials.refreshToken,
    resource: RESOURCE,
  });
  const accessToken = stringField(tokens.access_token, 'access_token');
  return {
    ...credentials,
    accessToken,
    refreshToken: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : credentials.refreshToken,
    idToken: typeof tokens.id_token === 'string' ? tokens.id_token : credentials.idToken,
    expiresAt: Date.now() + numberField(tokens.expires_in) * 1000,
    scopes: typeof tokens.scope === 'string' ? tokens.scope.split(' ') : credentials.scopes,
  };
}

/** Ends the renewable session at OpenAI. Resolves false when revocation was not confirmed. */
export async function revoke(credentials: Credentials, doFetch: typeof fetch = fetch): Promise<boolean> {
  try {
    const discovery = (await (await doFetch(DISCOVERY_URL)).json()) as { revocation_endpoint?: string };
    if (!discovery.revocation_endpoint) return false;
    const response = await doFetch(discovery.revocation_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: credentials.refreshToken, token_type_hint: 'refresh_token', client_id: credentials.clientId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function jwksFor(doFetch: typeof fetch) {
  const discovery = (await (await doFetch(DISCOVERY_URL)).json()) as { jwks_uri?: string };
  if (!discovery.jwks_uri) throw new SignInError('OpenAI publishes no JWKS', 'network');
  return createRemoteJWKSet(new URL(discovery.jwks_uri));
}

async function postForm(doFetch: typeof fetch, url: string, form: Record<string, string>): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(form),
    });
  } catch (error) {
    throw new SignInError(`token request failed: ${(error as Error).message}`, 'network');
  }
  const body = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok) {
    const code = typeof body.error === 'string' ? body.error : `HTTP ${response.status}`;
    throw new SignInError(`token request refused: ${code}`, 'invalid');
  }
  return body;
}

async function toCredentials(
  tokens: TokenResponse,
  clientId: string,
  nonce: string,
  jwks: Parameters<typeof jwtVerify>[1],
): Promise<Credentials> {
  const idToken = stringField(tokens.id_token, 'id_token');
  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(idToken, jwks, { issuer: ISSUER, audience: clientId }));
  } catch (error) {
    throw new SignInError(`ID token rejected: ${(error as Error).message}`, 'invalid');
  }
  if (claims.nonce !== nonce) throw new SignInError('ID token nonce does not match', 'invalid');
  if (!claims.sub) throw new SignInError('ID token has no subject', 'invalid');
  return {
    clientId,
    subject: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    idToken,
    accessToken: stringField(tokens.access_token, 'access_token'),
    refreshToken: stringField(tokens.refresh_token, 'refresh_token'),
    expiresAt: Date.now() + numberField(tokens.expires_in) * 1000,
    scopes: typeof tokens.scope === 'string' ? tokens.scope.split(' ') : [],
  };
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new SignInError(`token response has no ${name}`, 'invalid');
  return value;
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 3600;
}
