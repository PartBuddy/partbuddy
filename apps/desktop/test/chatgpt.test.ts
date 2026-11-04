import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatGptAccount, type ChatGptStatus } from '../src/main/chatgpt/account';
import { hostId, ISSUER, signIn, SignInError, type Credentials } from '../src/main/chatgpt/oauth';
import { memoryBackend, SecretStore } from '../src/main/credentials/secretStore';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A stand-in for auth.openai.com: signs ID tokens with a local key and records token requests. */
async function fakeOpenAI(options: { subject?: string; scope?: string; decline?: boolean } = {}) {
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
    nonce = authorize.searchParams.get('nonce') ?? '';
    const callback = new URL(authorize.searchParams.get('redirect_uri') ?? '');
    callback.searchParams.set('state', authorize.searchParams.get('state') ?? '');
    if (options.decline) callback.searchParams.set('error', 'access_denied');
    else {
      callback.searchParams.set('code', 'code-1');
      if (authorize.searchParams.get('client_id') === 'dynamic_agent_client') callback.searchParams.set('client_id', 'oaiapp_test');
    }
    setTimeout(() => void fetch(callback), 10);
    lastAuthorize = authorize;
    return Promise.resolve();
  };
  let lastAuthorize: URL | null = null;
  return { fakeFetch, jwks, openBrowser, requests, authorize: () => lastAuthorize };
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

  it('signs in, stores tokens only in the credential store and reuses the client on the next sign-in', async () => {
    const openai = await fakeOpenAI();
    const { instance, store } = account(openai);
    const status = await instance.signIn();
    expect(status).toEqual({ state: 'signedIn', email: 'someone@example.com' });
    expect(JSON.parse(store.read('chatgpt/client') ?? '{}')).toMatchObject({ clientId: 'oaiapp_test', subject: 'user-1' });
    await instance.signOut();
    expect(store.read('chatgpt/tokens')).toBeNull();
    expect(openai.requests.at(-1)).toMatchObject({ token: 'refresh-1', token_type_hint: 'refresh_token', client_id: 'oaiapp_test' });
    await instance.signIn();
    expect(openai.authorize()?.searchParams.get('client_id')).toBe('oaiapp_test');
    expect(openai.authorize()?.searchParams.has('agent_name_hint')).toBe(false);
    expect(openai.authorize()?.searchParams.has('id_token_hint')).toBe(true);
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

