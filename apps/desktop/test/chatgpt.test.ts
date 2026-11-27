import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatGptAccount, type ChatGptStatus } from '../src/main/chatgpt/account';
import { callbackPage, hostId, ISSUER, signIn, SignInError, type Credentials } from '../src/main/chatgpt/oauth';
import { memoryBackend, SecretStore } from '../src/main/credentials/secretStore';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A stand-in for auth.openai.com: signs ID tokens with a local key and records token requests. */
async function fakeOpenAI(options: { subject?: string; scope?: string; decline?: boolean; hang?: boolean } = {}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const requests: Record<string, string>[] = [];
  let nonce = '';
  let refreshCount = 0;
  const idToken = (clientId: string) =>
    new SignJWT({ nonce, email: 'someone@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience(clientId)
      .setSubject(options.subject ?? 'user-1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    if (href.endsWith('/.well-known/openid-configuration')) {
      return Response.json({ jwks_uri: 'https://example.invalid/jwks', revocation_endpoint: `${ISSUER}/revoke` });
    }
    const form = Object.fromEntries(new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : undefined));
    requests.push(form);
    if (href.endsWith('/revoke')) return new Response(null, { status: 200 });
    if (form.grant_type === 'refresh_token') {
      refreshCount += 1;
      if (form.refresh_token === 'dead') return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ access_token: `access-${refreshCount + 1}`, refresh_token: `refresh-${refreshCount + 1}`, expires_in: 3600 });
    }
    return Response.json({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      id_token: await idToken(form.client_id ?? ''),
      expires_in: 3600,
      scope: options.scope ?? 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
    });
  }) as typeof fetch;

  /** Plays the browser: reads the authorize URL and calls the loopback callback. */
  const openBrowser = async (url: string) => {
    const authorize = new URL(url);
    lastAuthorize = authorize;
    // A browser whose sign-in page never returns to PartBuddy (issue #445).
    if (options.hang) return Promise.resolve();
    nonce = authorize.searchParams.get('nonce') ?? '';
    const callback = new URL(authorize.searchParams.get('redirect_uri') ?? '');
    callback.searchParams.set('state', authorize.searchParams.get('state') ?? '');
    if (options.decline) callback.searchParams.set('error', 'access_denied');
    else {
      callback.searchParams.set('code', 'code-1');
      if (authorize.searchParams.get('client_id') === 'dynamic_agent_client') callback.searchParams.set('client_id', 'oaiapp_test');
    }
    setTimeout(() => void fetch(callback, { headers: { 'Accept-Language': 'de-AT,de;q=0.9,en;q=0.8' } }).then(async (r) => pages.push(await r.text())), 10);
    lastAuthorize = authorize;
    return Promise.resolve();
  };
  let lastAuthorize: URL | null = null;
  const pages: string[] = [];
  return { fakeFetch, jwks, openBrowser, requests, options, pages, authorize: () => lastAuthorize };
}

describe('secret store', () => {
  it('splits long secrets across credentials and reads them back', () => {
    const backend = memoryBackend();
    const store = new SecretStore(backend);
    const value = 'x'.repeat(6000) + 'ü';
    store.write('chatgpt/tokens', value);
    expect(store.read('chatgpt/tokens')).toBe(value);
    expect([...backend.entries.keys()].sort()).toEqual(['chatgpt/tokens', 'chatgpt/tokens#0', 'chatgpt/tokens#1', 'chatgpt/tokens#2']);
    store.write('chatgpt/tokens', 'short');
    expect(store.read('chatgpt/tokens')).toBe('short');
    expect(backend.entries.has('chatgpt/tokens#1')).toBe(false);
    store.remove('chatgpt/tokens');
    expect(backend.entries.size).toBe(0);
    expect(store.read('chatgpt/tokens')).toBeNull();
  });
});

describe('Sign in with ChatGPT', () => {
  it('keeps one opaque host ID per installation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'partbuddy-host-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, 'host-id');
    const first = hostId(file);
    expect(first).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
    expect(hostId(file)).toBe(first);
    expect(readFileSync(file, 'utf8').trim()).toBe(first);
  });

  it('registers dynamically with PKCE and verifies the ID token', async () => {
    const openai = await fakeOpenAI();
    const credentials = await signIn({ hostId: 'urn:uuid:test', openBrowser: openai.openBrowser, fetch: openai.fakeFetch, jwks: openai.jwks });
    const authorize = openai.authorize();
    expect(`${authorize?.origin ?? ''}${authorize?.pathname ?? ''}`).toBe(`${ISSUER}/api/accounts/authorize`);
    expect(authorize?.searchParams.get('client_id')).toBe('dynamic_agent_client');
    expect(authorize?.searchParams.get('agent_name_hint')).toBe('PartBuddy');
    expect(authorize?.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize?.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
    expect(authorize?.searchParams.get('scope')).toContain('chatgpt.tokens.use.direct');
    const exchange = openai.requests[0];
    expect(exchange).toMatchObject({ grant_type: 'authorization_code', client_id: 'oaiapp_test', code: 'code-1', resource: 'https://api.openai.com/v1' });
    expect(exchange?.code_verifier).toMatch(/^[\w-]{43}$/);
    expect(credentials).toMatchObject({ clientId: 'oaiapp_test', subject: 'user-1', accessToken: 'access-1', refreshToken: 'refresh-1' });
    // The browser gets a branded page in its language that never repeats the code or state.
    const page = openai.pages[0] ?? '';
    expect(page).toContain('aria-label="PartBuddy"');
    expect(page).toContain('Autorisierung empfangen');
    expect(page).not.toContain('code-1');
    expect(page).not.toContain(authorize?.searchParams.get('state') ?? 'state');
  });

  it('words the callback page by outcome and browser language', () => {
    expect(callbackPage('received')).toContain('Return to PartBuddy to check whether the connection completed');
    expect(callbackPage('declined', 'en-US,en;q=0.9')).toContain('Sign-in cancelled');
    expect(callbackPage('declined', 'de')).toContain('Anmeldung abgebrochen');
    expect(callbackPage('received', 'fr-FR,de;q=0.8')).toContain('lang="en"');
  });

  it('reports a declined consent without exchanging a code', async () => {
    const openai = await fakeOpenAI({ decline: true });
    const error = await signIn({ hostId: 'urn:uuid:test', openBrowser: openai.openBrowser, fetch: openai.fakeFetch, jwks: openai.jwks }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SignInError);
    expect((error as SignInError).kind).toBe('declined');
    expect(openai.requests).toEqual([]);
  });

  it('rejects an ID token signed by another key', async () => {
    const openai = await fakeOpenAI();
    const other = await fakeOpenAI();
    await expect(
      signIn({ hostId: 'urn:uuid:test', openBrowser: openai.openBrowser, fetch: openai.fakeFetch, jwks: other.jwks }),
    ).rejects.toThrow(/ID token rejected/);
  });
});

describe('ChatGPT account', () => {
  function account(openai: Awaited<ReturnType<typeof fakeOpenAI>>, backend = memoryBackend()) {
    const statuses: ChatGptStatus[] = [];
    const store = new SecretStore(backend);
    const instance = new ChatGptAccount({
      store,
      hostId: () => 'urn:uuid:test',
      openBrowser: openai.openBrowser,
      fetch: openai.fakeFetch,
      jwks: openai.jwks,
      onStatus: (status) => statuses.push(status),
    });
    return { instance, statuses, store, backend };
  }

  it('signs in, stores tokens only in the credential store and reuses the client while it stays signed in', async () => {
    const openai = await fakeOpenAI();
    const { instance, store, backend } = account(openai);
    const status = await instance.signIn();
    expect(status).toEqual({ state: 'signedIn', email: 'someone@example.com' });
    expect(JSON.parse(store.read('chatgpt/client') ?? '{}')).toMatchObject({ clientId: 'oaiapp_test', subject: 'user-1' });
    expect(account(openai, backend).instance.load()).toEqual(status);
    // A second sign-in without signing out (e.g. after the session ended) keeps the registration.
    await instance.signIn();
    expect(openai.authorize()?.searchParams.get('client_id')).toBe('oaiapp_test');
    expect(openai.authorize()?.searchParams.has('agent_name_hint')).toBe(false);
    expect(openai.authorize()?.searchParams.has('id_token_hint')).toBe(true);
  });

  // Issue #445: signing out revokes the registration; signing in again must start a fresh flow.
  it('signs in again after signing out, with the same account', async () => {
    const openai = await fakeOpenAI();
    const { instance, store } = account(openai);
    await instance.signIn();
    await instance.signOut();
    expect(store.read('chatgpt/tokens')).toBeNull();
    expect(store.read('chatgpt/client')).toBeNull();
    expect(openai.requests.at(-1)).toMatchObject({ token: 'refresh-1', token_type_hint: 'refresh_token', client_id: 'oaiapp_test' });
    const status = await instance.signIn();
    expect(openai.authorize()?.searchParams.get('client_id')).toBe('dynamic_agent_client');
    expect(openai.authorize()?.searchParams.has('id_token_hint')).toBe(false);
    expect(status).toEqual({ state: 'signedIn', email: 'someone@example.com' });
  });

  it('signs in again after signing out, with another account', async () => {
    const openai = await fakeOpenAI();
    const { instance, store } = account(openai);
    await instance.signIn();
    await instance.signOut();
    openai.options.subject = 'user-2';
    expect((await instance.signIn()).state).toBe('signedIn');
    expect(JSON.parse(store.read('chatgpt/client') ?? '{}')).toMatchObject({ subject: 'user-2' });
  });

  it('starts a fresh registration after a returning sign-in failed', async () => {
    const openai = await fakeOpenAI();
    const { instance, store } = account(openai);
    await instance.signIn();
    // The session ended at OpenAI (tokens dropped, no sign-out here), then another account signs in.
    store.remove('chatgpt/tokens');
    instance.load();
    openai.options.subject = 'user-2';
    const failed = await instance.signIn();
    expect(failed.state).toBe('signedOut');
    expect(failed.detail).toMatch(/different ChatGPT account/);
    const retried = await instance.signIn();
    expect(openai.authorize()?.searchParams.get('client_id')).toBe('dynamic_agent_client');
    expect(retried.state).toBe('signedIn');
  });

  it('replaces a sign-in that never returns from the browser with a new one', async () => {
    const openai = await fakeOpenAI({ hang: true });
    const { instance, statuses } = account(openai);
    const stuck = instance.signIn();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(instance.status().state).toBe('signingIn');
    const stuckPort = new URL(openai.authorize()?.searchParams.get('redirect_uri') ?? '').port;
    openai.options.hang = false;
    expect((await instance.signIn()).state).toBe('signedIn');
    // The first attempt ends at once instead of waiting ten minutes, and does not overwrite the result.
    await stuck;
    expect(instance.status().state).toBe('signedIn');
    expect(statuses.at(-1)?.state).toBe('signedIn');
    await expect(fetch(`http://127.0.0.1:${stuckPort}/auth/callback`)).rejects.toThrow();
  });

  it('marks plan usage as disabled when the consent lacks the plan scope', async () => {
    const openai = await fakeOpenAI({ scope: 'openid profile email offline_access' });
    const { instance } = account(openai);
    expect((await instance.signIn()).state).toBe('planDisabled');
    await expect(instance.accessToken()).rejects.toThrow(/not enabled/);
  });

  it('renews an expiring token once, and signs out when the refresh token is dead', async () => {
    const openai = await fakeOpenAI();
    const backend = memoryBackend();
    const store = new SecretStore(backend);
    const expiring: Credentials = {
      clientId: 'oaiapp_test',
      subject: 'user-1',
      email: null,
      idToken: 'id',
      accessToken: 'old',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 30_000,
      scopes: ['chatgpt.tokens.use.direct'],
    };
    store.write('chatgpt/tokens', JSON.stringify(expiring));
    const { instance } = account(openai, backend);
    instance.load();
    const [a, b] = await Promise.all([instance.accessToken(), instance.accessToken()]);
    expect(a).toBe('access-2');
    expect(b).toBe('access-2');
    expect(openai.requests.filter((r) => r.grant_type === 'refresh_token')).toHaveLength(1);
    expect(JSON.parse(store.read('chatgpt/tokens') ?? '{}')).toMatchObject({ refreshToken: 'refresh-2' });

    store.write('chatgpt/tokens', JSON.stringify({ ...expiring, refreshToken: 'dead' }));
    instance.load();
    await expect(instance.accessToken()).rejects.toThrow(/invalid_grant/);
    expect(instance.status().state).toBe('signedOut');
    expect(store.read('chatgpt/tokens')).toBeNull();
  });
});

