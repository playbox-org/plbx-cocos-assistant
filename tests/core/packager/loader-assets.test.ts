import { describe, it, expect } from 'vitest';
import { emitAssetIO } from '../../../src/core/packager/loader/assets';

describe('emitAssetIO (Facebook-safe)', () => {
  const js = emitAssetIO({});

  it('defines window._XMLLocalRequest and contains NO literal XMLHttpRequest', () => {
    expect(js).toContain('window._XMLLocalRequest =');
    // FB blocks/rewrites the literal "XMLHttpRequest" → _xrq_. The loader must
    // not reference it; the engine is rewritten to use _XMLLocalRequest.
    expect(js).not.toContain('XMLHttpRequest');
  });

  it('_XMLLocalRequest completes via direct onload (no dispatchEvent)', () => {
    expect(js).not.toContain('dispatchEvent');
    expect(js).toContain('self.onload()');
  });

  it('defines window._createLocalJSElement using an inert custom tag (no real <script>)', () => {
    expect(js).toContain('window._createLocalJSElement =');
    expect(js).toContain("createElement('plbx-script')");
    expect(js).not.toContain("createElement('script')");
  });

  it('registers image+font downloader handlers reading plbx_getRes', () => {
    expect(js).toContain('assetManager.downloader.register');
    expect(js).toContain('plbx_getRes');
    expect(js).toContain("'.png': loadImage");
    expect(js).toContain("'.ttf': loadFont");
    // json/bin/cconb go via _XMLLocalRequest (arraybuffer); audio must NOT be
    // handler-intercepted — WebAudio needs the arraybuffer, an <audio> element
    // would break decodeAudioData → silence.
    expect(js).not.toContain("'.cconb'");
    expect(js).not.toContain("loadAudio");
    expect(js).not.toContain("'.mp3'");
  });

  it('fetch override enforces the no-network policy for off-cache URLs', () => {
    expect(js).toContain('window.fetch =');
    expect(js).toContain('_isExternalUrl(url)');
  });
});

describe('_XMLLocalRequest parse safety (#7)', () => {
  // Build the real emitted shim and run it with a synchronous setTimeout so we
  // can assert behavior, not just source tokens.
  function makeXHR(findAsset: (url: string) => any): any {
    const win: any = {};
    const factory = new Function(
      'window', '_findAsset', 'atob', 'setTimeout', 'console',
      emitAssetIO({}) + '\nplbx_install_shims();\nreturn window._XMLLocalRequest;',
    );
    return factory(win, findAsset, (s: string) => s, (fn: any) => fn(), console);
  }

  it('routes malformed JSON to onerror instead of throwing out of send()', () => {
    const XHR = makeXHR(() => ({ data: '{ not valid json', binary: false }));
    const xhr = new XHR();
    xhr.open('GET', 'foo.json');
    xhr.responseType = 'json';
    let errored = false, loaded = false;
    xhr.onerror = () => { errored = true; };
    xhr.onload = () => { loaded = true; };
    expect(() => xhr.send()).not.toThrow();
    expect(errored).toBe(true);
    expect(loaded).toBe(false);
  });

  it('parses valid JSON and fires onload with the parsed response', () => {
    const XHR = makeXHR(() => ({ data: '{"a":1}', binary: false }));
    const xhr = new XHR();
    xhr.open('GET', 'ok.json');
    xhr.responseType = 'json';
    let loaded = false;
    xhr.onload = () => { loaded = true; };
    xhr.send();
    expect(loaded).toBe(true);
    expect(xhr.response).toEqual({ a: 1 });
    expect(xhr.status).toBe(200);
  });
});
