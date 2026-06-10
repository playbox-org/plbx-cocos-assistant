import { describe, it, expect, vi } from 'vitest';
import { MolocoCdnClient, MOLOCO_API_BASE } from '../../../src/core/deployer/moloco-cdn';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeFetch(routes: Array<(url: string, init?: RequestInit) => Response | null>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    for (const r of routes) {
      const res = r(url, init);
      if (res) return res;
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const tokenRoute = (url: string, init?: RequestInit) =>
  url === `${MOLOCO_API_BASE}/auth/tokens` && init?.method === 'POST'
    ? jsonResponse({ token: 'TOK123' })
    : null;

const sessionRoute = (url: string, init?: RequestInit) =>
  url.startsWith(`${MOLOCO_API_BASE}/creative-assets?ad_account_id=ACC1`) && init?.method === 'POST'
    ? jsonResponse({
        asset_url: 'https://cdn.moloco/assets/abc.js',
        content_upload_url: 'https://upload.moloco/put/abc',
      })
    : null;

const putRoute = (url: string, init?: RequestInit) =>
  url === 'https://upload.moloco/put/abc' && init?.method === 'PUT'
    ? jsonResponse({}, 200)
    : null;

describe('MolocoCdnClient', () => {
  it('uploads payload: token → session → PUT, returns asset_url', async () => {
    const { fn, calls } = makeFetch([tokenRoute, sessionRoute, putRoute]);
    const client = new MolocoCdnClient({ apiKey: 'KEY', adAccountId: 'ACC1', fetchFn: fn });

    const res = await client.uploadPayload('console.log(1)');

    expect(res.assetUrl).toBe('https://cdn.moloco/assets/abc.js');
    // auth call carries api_key in body
    expect(calls[0].init?.body).toContain('KEY');
    // session call carries bearer token + EXTERNAL/text-javascript body
    const sessionCall = calls[1];
    expect((sessionCall.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer TOK123');
    expect(sessionCall.init?.body).toContain('"asset_kind":"EXTERNAL"');
    expect(sessionCall.init?.body).toContain('"mime_type":"text/javascript"');
    // PUT uploads the raw payload body
    expect(calls[2].init?.body).toBe('console.log(1)');
  });

  it('caches the token across uploads (16h expiry per spec)', async () => {
    const { fn, calls } = makeFetch([tokenRoute, sessionRoute, putRoute]);
    const client = new MolocoCdnClient({ apiKey: 'KEY', adAccountId: 'ACC1', fetchFn: fn });

    await client.uploadPayload('a');
    await client.uploadPayload('b');

    const tokenCalls = calls.filter((c) => c.url.endsWith('/auth/tokens'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('throws a readable error when auth fails', async () => {
    const { fn } = makeFetch([
      (url, init) =>
        url.endsWith('/auth/tokens') && init?.method === 'POST'
          ? jsonResponse({ message: 'invalid key' }, 401)
          : null,
    ]);
    const client = new MolocoCdnClient({ apiKey: 'BAD', adAccountId: 'ACC1', fetchFn: fn });

    await expect(client.uploadPayload('x')).rejects.toThrow(/auth.*401/i);
  });

  it('throws when session creation fails', async () => {
    const { fn } = makeFetch([
      tokenRoute,
      (url, init) =>
        url.includes('/creative-assets') && init?.method === 'POST'
          ? jsonResponse({ message: 'bad account' }, 403)
          : null,
    ]);
    const client = new MolocoCdnClient({ apiKey: 'KEY', adAccountId: 'ACC1', fetchFn: fn });

    await expect(client.uploadPayload('x')).rejects.toThrow(/session.*403/i);
  });

  it('throws when the PUT upload fails', async () => {
    const { fn } = makeFetch([
      tokenRoute,
      sessionRoute,
      (url, init) => (init?.method === 'PUT' ? jsonResponse({}, 500) : null),
    ]);
    const client = new MolocoCdnClient({ apiKey: 'KEY', adAccountId: 'ACC1', fetchFn: fn });

    await expect(client.uploadPayload('x')).rejects.toThrow(/upload.*500/i);
  });

  it('requires apiKey and adAccountId', () => {
    expect(() => new MolocoCdnClient({ apiKey: '', adAccountId: 'A' })).toThrow(/api key/i);
    expect(() => new MolocoCdnClient({ apiKey: 'K', adAccountId: '' })).toThrow(/account/i);
  });
});
