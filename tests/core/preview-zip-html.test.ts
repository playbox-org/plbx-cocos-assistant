import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import JSZip from 'jszip';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { extractHtmlFromZip } from '../../src/core/preview/server';

async function makeZip(dir: string, zipName: string, innerName: string, content: string): Promise<string> {
  const zip = new JSZip();
  zip.file(innerName, content);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const p = join(dir, zipName);
  writeFileSync(p, buf);
  return p;
}

describe('extractHtmlFromZip', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'plbx-zip-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds zip-name-matched HTML (Mintegral web-mobile-001.html)', async () => {
    const p = await makeZip(dir, 'web-mobile-001.zip', 'web-mobile-001.html', '<html>MINT</html>');
    expect(await extractHtmlFromZip(p)).toContain('MINT');
  });

  it('finds source.html in a Luna archive that also holds the manifests', async () => {
    // Luna's contract: the entry is source.html and index.html is absent, with
    // luna.json + playground.json beside it. Before source.html was ranked, the
    // lookup fell through to "first root-level .html" — readdir-order dependent.
    const zip = new JSZip();
    zip.file('luna.json', '{}');
    zip.file('playground.json', '{}');
    // Decoy inserted FIRST: without an explicit source.html rank the lookup falls
    // through to "first root-level .html" and returns this instead.
    zip.file('aaa-leftover.html', '<html>DECOY</html>');
    zip.file('source.html', '<html>LUNA</html>');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const p = join(dir, 'luna.zip');
    writeFileSync(p, buf);
    const html = await extractHtmlFromZip(p);
    expect(html).toContain('LUNA');
    expect(html).not.toContain('DECOY');
  });

  it('still finds index.html', async () => {
    const p = await makeZip(dir, 'bundle.zip', 'index.html', '<html>IDX</html>');
    expect(await extractHtmlFromZip(p)).toContain('IDX');
  });

  it('falls back to any root-level .html', async () => {
    const p = await makeZip(dir, 'weird.zip', 'game.html', '<html>GAME</html>');
    expect(await extractHtmlFromZip(p)).toContain('GAME');
  });

  it('throws when the ZIP has no HTML', async () => {
    const p = await makeZip(dir, 'empty.zip', 'data.json', '{}');
    await expect(extractHtmlFromZip(p)).rejects.toThrow();
  });
});
