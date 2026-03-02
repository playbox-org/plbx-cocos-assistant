import { describe, it, expect, afterEach } from 'vitest';
import { startPreviewServer, stopPreviewServer } from '../../../src/core/preview/server';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import http from 'http';

function httpGet(url: string): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => body += chunk);
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        body,
        headers: res.headers as Record<string, string>,
      }));
    }).on('error', reject);
  });
}

const TMP = join(__dirname, '../fixtures/preview-test-tmp');

describe('Preview Server', () => {
  afterEach(async () => {
    await stopPreviewServer();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('should start on a free port and serve validator UI at /', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body>test</body></html>');

    const { port, url } = await startPreviewServer({
      outputDir: TMP,
      networks: ['applovin'],
    });

    expect(port).toBeGreaterThan(0);
    const res = await httpGet(url);
    expect(res.status).toBe(200);
    expect(res.body).toContain('Playbox Preview Validator'); // validator UI title
  });

  it('should serve /api/networks with network metadata', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body>ok</body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['applovin'] });
    const res = await httpGet(url + '/api/networks');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('applovin');
    expect(data[0].size).toBeGreaterThan(0);
  });

  it('should serve /preview/{networkId} with injected preview-util.js', async () => {
    mkdirSync(join(TMP, 'ironsource'), { recursive: true });
    writeFileSync(join(TMP, 'ironsource', 'index.html'),
      '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>game</p></body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['ironsource'] });
    const res = await httpGet(url + '/preview/ironsource');
    expect(res.status).toBe(200);
    expect(res.body).toContain('__plbxReport'); // from preview-util.js
    expect(res.body).toContain('window.mraid'); // ironsource is MRAID
    // preview-util should be injected BEFORE other scripts
    const utilIdx = res.body.indexOf('__plbxReport');
    const bodyIdx = res.body.indexOf('<body>');
    expect(utilIdx).toBeLessThan(bodyIdx);
  });

  it('should extract HTML from ZIP for singleFileZip networks', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('index.html', '<html><head></head><body>mintegral</body></html>');
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });

    mkdirSync(join(TMP, 'mintegral'), { recursive: true });
    writeFileSync(join(TMP, 'mintegral', 'index.zip'), zipBuf);

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['mintegral'] });
    const res = await httpGet(url + '/preview/mintegral');
    expect(res.status).toBe(200);
    expect(res.body).toContain('mintegral');
    expect(res.body).toContain('window.install'); // Mintegral CTA mock
  });

  it('should stop server cleanly', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body></body></html>');

    const { port } = await startPreviewServer({ outputDir: TMP, networks: ['applovin'] });
    await stopPreviewServer();

    await expect(httpGet('http://127.0.0.1:' + port + '/')).rejects.toThrow();
  });
});
