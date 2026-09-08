/**
 * The extension's upload path to the repack door (plbx-collector `POST /repack`).
 *
 * Two pure pieces live here and are tested without the editor and without the
 * kit: the HTTP client (`uploadForRepack`) and the response unpacker
 * (`unpackRepackResponse`). `main.ts` wires them around the kit call, which
 * this worktree's kit (0.3.9) cannot make — it has no `plbx` target.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import JSZip from 'jszip';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  uploadForRepack,
  unpackRepackResponse,
  escapesOutputDir,
  type RepackSummary,
} from '../../../src/core/repack/client';

function zipResponse(buildId: string, body: Buffer, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'x-plbx-build-id' ? buildId : null) },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    text: async () => body.toString('utf-8'),
  } as unknown as Response;
}

const summary: RepackSummary = {
  buildId: 'b_abc',
  kind: 'prod',
  expiresAt: 0,
  recorded: true,
  artifacts: [
    { network: 'applovin', files: [{ path: 'applovin/index.html', format: 'html', bytes: 12, maxSize: 5242880 }] },
    { network: 'snapchat', files: [{ path: 'snapchat/index.zip', format: 'zip', bytes: 3, maxSize: 5242880 }] },
  ],
  failures: [{ network: 'facebook', reason: 'facebook machine-checks uploads' }],
};

async function buildResponseZip(entries: Record<string, Buffer | string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const tmpDirs: string[] = [];
function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'plbx-repack-client-'));
  tmpDirs.push(d);
  return d;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('uploadForRepack', () => {
  it('posts the archive as application/zip with the bearer and the selected networks', async () => {
    const archive = Buffer.from('PK-archive');
    const fetchFn = vi.fn(async () => zipResponse('b_1', Buffer.from('zip')));
    await uploadForRepack({
      archive,
      repackUrl: 'https://repack.example/',
      token: 'secret',
      networks: ['applovin', 'unity'],
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://repack.example/repack?networks=applovin,unity&kind=prod');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer secret');
    expect(headers['Content-Type']).toBe('application/zip');
    expect(Buffer.from(init.body as Uint8Array).equals(archive)).toBe(true);
  });

  it('strips every trailing slash from the door URL and encodes each network id', async () => {
    const fetchFn = vi.fn(async () => zipResponse('b_1', Buffer.from('zip')));
    await uploadForRepack({
      archive: Buffer.from('PK'),
      repackUrl: 'https://repack.example//',
      token: 'secret',
      networks: ['applovin', 'odd id&#'],
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const [url] = fetchFn.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://repack.example/repack?networks=applovin,odd%20id%26%23&kind=prod');
  });

  it('returns the build id and the zip on success', async () => {
    const body = Buffer.from('the-response-zip');
    const fetchFn = vi.fn(async () => zipResponse('b_xyz', body));
    const res = await uploadForRepack({
      archive: Buffer.from('a'),
      repackUrl: 'https://repack.example',
      token: 't',
      networks: ['applovin'],
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.buildId).toBe('b_xyz');
      expect(res.zip.equals(body)).toBe(true);
    }
  });

  it('reports an HTTP error with the status and never throws', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 422,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: 'no artifact produced' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as Response);
    const res = await uploadForRepack({
      archive: Buffer.from('a'),
      repackUrl: 'https://repack.example',
      token: 't',
      networks: ['facebook'],
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(res).toMatchObject({ ok: false, error: 'http_error', status: 422 });
    if (!res.ok) expect(res.detail).toContain('no artifact produced');
  });

  it('reports a network failure as a result, not an exception', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const res = await uploadForRepack({
      archive: Buffer.from('a'),
      repackUrl: 'https://repack.example',
      token: 't',
      networks: ['applovin'],
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(res).toMatchObject({ ok: false, error: 'network_error' });
    if (!res.ok) expect(res.detail).toContain('ECONNREFUSED');
  });

  it('reports a 2xx without a build id as a bad response', async () => {
    const fetchFn = vi.fn(async () => zipResponse('', Buffer.from('zip')));
    const res = await uploadForRepack({
      archive: Buffer.from('a'),
      repackUrl: 'https://repack.example',
      token: 't',
      networks: ['applovin'],
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(res).toMatchObject({ ok: false, error: 'bad_response' });
  });

  it('refuses to upload without a URL, a token, or an archive — before touching the network', async () => {
    const fetchFn = vi.fn();
    const base = { archive: Buffer.from('a'), repackUrl: 'https://r', token: 't', networks: ['applovin'], fetchFn: fetchFn as unknown as typeof fetch };
    expect(await uploadForRepack({ ...base, repackUrl: '' })).toMatchObject({ ok: false, error: 'no_repack_url' });
    expect(await uploadForRepack({ ...base, token: '' })).toMatchObject({ ok: false, error: 'no_repack_token' });
    expect(await uploadForRepack({ ...base, archive: Buffer.alloc(0) })).toMatchObject({ ok: false, error: 'no_archive' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uses the global fetch when no fetchFn is injected', async () => {
    const mockFetch = vi.fn(async () => zipResponse('b_g', Buffer.from('zip')));
    global.fetch = mockFetch as unknown as typeof fetch;
    const res = await uploadForRepack({ archive: Buffer.from('a'), repackUrl: 'https://r', token: 't', networks: ['applovin'], kind: 'dev' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((mockFetch.mock.calls[0] as unknown as [string])[0]).toBe('https://r/repack?networks=applovin&kind=dev');
    expect(res.ok).toBe(true);
  });
});

describe('unpackRepackResponse', () => {
  it('unpacks <network>/<artifact> + repack.json into the output dir and returns the summary', async () => {
    const out = freshDir();
    const zip = await buildResponseZip({
      'applovin/index.html': '<html>applovin</html>',
      'snapchat/index.zip': Buffer.from([0x50, 0x4b, 0x00]),
      'repack.json': JSON.stringify(summary),
    });
    const got = await unpackRepackResponse(zip, out);
    expect(got).toEqual(summary);
    expect(readFileSync(join(out, 'applovin', 'index.html'), 'utf-8')).toBe('<html>applovin</html>');
    expect(readFileSync(join(out, 'snapchat', 'index.zip')).equals(Buffer.from([0x50, 0x4b, 0x00]))).toBe(true);
    // repack.json lands beside the network dirs, deliberately — the record of what the door produced.
    expect(JSON.parse(readFileSync(join(out, 'repack.json'), 'utf-8'))).toEqual(summary);
  });

  it('refuses an entry that would escape the output dir', async () => {
    // The guard itself, on the names that must never be written:
    expect(escapesOutputDir('../escape.html', '/out')).toBe(true);
    expect(escapesOutputDir('a/../../escape.html', '/out')).toBe(true);
    expect(escapesOutputDir('/tmp/abs.html', '/out')).toBe(true);
    expect(escapesOutputDir('C:\\evil.html', '/out')).toBe(true);
    expect(escapesOutputDir('applovin/index.html', '/out')).toBe(false);
    expect(escapesOutputDir('repack.json', '/out')).toBe(false);

    // End to end: JSZip collapses `../` on load, so an absolute entry is the
    // form that actually reaches the unpacker — it must refuse before writing
    // anything, and a `../` name must never land outside the dir either way.
    const out = freshDir();
    const abs = await buildResponseZip({
      'applovin/index.html': '<html></html>',
      '/tmp/abs.html': 'nope',
      'repack.json': JSON.stringify(summary),
    });
    await expect(unpackRepackResponse(abs, out)).rejects.toThrow(/escape/i);
    expect(existsSync(join(out, 'applovin', 'index.html'))).toBe(false);

    const dotdot = await buildResponseZip({
      '../escape.html': 'nope',
      'repack.json': JSON.stringify(summary),
    });
    await unpackRepackResponse(dotdot, out).catch(() => undefined);
    expect(existsSync(join(out, '..', 'escape.html'))).toBe(false);
  });

  it('refuses a response without repack.json', async () => {
    const out = freshDir();
    const zip = await buildResponseZip({ 'applovin/index.html': '<html></html>' });
    await expect(unpackRepackResponse(zip, out)).rejects.toThrow(/repack\.json/);
  });
});
