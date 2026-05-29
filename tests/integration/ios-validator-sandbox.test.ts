/**
 * iOS AppLovin validator regression guard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST EXISTS / WHY IT MUST NOT BE "SIMPLIFIED"
 * ─────────────────────────────────────────────────────────────────────────────
 * A PLBX-packaged Cocos playable showed a GRAY SCREEN *only* inside the real
 * AppLovin iOS validator, and NEVER in plain desktop Chrome / `file://` loads.
 * The difference was the runtime ENVIRONMENT, not the game:
 *
 *   The real validator loads the playable like this:
 *       <iframe sandbox="allow-scripts" srcdoc="...whole HTML...">
 *                         ^^^^^^^^^^^^^   NO allow-same-origin
 *   which gives the iframe:
 *       - origin            === "null"
 *       - document.baseURI  === "about:srcdoc"   (or file:// on device)
 *   ...AND on iOS the engine is WebKit (WKWebView), not Blink.
 *
 * Two distinct bugs only manifest in THAT environment (both fixed in
 * src/core/packager/runtime-loader.ts — do NOT touch src/ from this test):
 *
 *   Bug #1 (null-origin, any engine):
 *     SystemJS resolved the importmap target `cc` to `about:cocos-js/cc.js`
 *     because the importmap was absolutized against the about:srcdoc base at
 *     parse time. That about: URL never matched our ZIP cache keys
 *     ("cocos-js/cc.js") → engine never loaded → gray screen.
 *     Fix = `_deAbout()` normalization in SystemJS resolve/instantiate/fetch.
 *
 *   Bug #2 (WebKit-specific):
 *     For cached assets the loader skips native xhr.open() and emulates
 *     completion. It used to dispatchEvent('load') ONLY. Blink routes a
 *     synthetic 'load' event to the `xhr.onload` *attribute* handler; WebKit
 *     does NOT (a synthetic event on a never-opened XHR fires
 *     addEventListener listeners but not on* attribute handlers).
 *     Cocos `Settings.init()` sets `xhr.onload = fn` directly, so on iOS that
 *     callback never fired → `cc.game.init()` Promise hung forever →
 *     `cc.game._inited` stayed false → gray screen.
 *     Fix = after dispatchEvent, also invoke onreadystatechange/onprogress/
 *     onload handlers directly.
 *
 * Therefore this test:
 *   - loads the packaged HTML inside a null-origin sandboxed srcdoc iframe
 *     (NOT a direct file:// navigation — that has a real origin and HIDES bug #1),
 *   - runs in WebKit (to catch bug #2 — Blink can only catch bug #1),
 *   - and additionally runs the same null-origin harness in Chromium so the
 *     null-origin path (bug #1) is still guarded even when WebKit is missing.
 *
 * Success condition that BOTH bugs break: the engine boots AND the scene loads.
 * If anyone reverts a fix, the corresponding poll below times out → red.
 *
 * Requires:
 *   - Playwright WebKit:  npx playwright install webkit
 *     (auto-skips the webkit describe block if the binary is unavailable.)
 *   - A real build fixture under tests/fixtures/<project>-build/web-mobile/.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { webkit, chromium } from 'playwright';
import type { Browser, BrowserType, Page } from 'playwright';
import { packageForNetworks } from '../../src/core/packager/packager';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

// ── Fixture selection ────────────────────────────────────────────────────────
// Pick the first present & bootable web-mobile build. We exercise the SystemJS +
// cached-XHR boot path that both bugs live on, so the fixture MUST actually boot
// to a loaded scene (cc.game._inited === true) — otherwise the test can't tell a
// regression from a dead fixture.
//
// NOTE on ordering: spades and farmington both boot to a full scene in the
// null-origin srcdoc sandbox (verified on chromium AND webkit). The roadside
// fixture is INTENTIONALLY NOT used here: its packaged project bundle throws
// "Module './index.js' ... is expected be an ESM-wrapped CommonJS module but it
// doesn't" and never reaches cc.game._inited === true even on a plain file://
// load — i.e. it's a broken-bundle fixture unrelated to bugs #1/#2, so it would
// give a false red. Keep a bootable fixture first.
const FIXTURE_CANDIDATES = [
  { name: 'spades', orientation: 'portrait' as const },
  { name: 'farmington', orientation: 'portrait' as const },
];

function pickFixture() {
  for (const f of FIXTURE_CANDIDATES) {
    const buildDir = join(__dirname, `../fixtures/${f.name}-build/web-mobile`);
    if (existsSync(join(buildDir, 'index.html'))) {
      return { ...f, buildDir, outputDir: join(__dirname, `../fixtures/${f.name}-build/ios-sandbox-output`) };
    }
  }
  return null;
}

const FIXTURE = pickFixture();
const HAS_BUILD = FIXTURE !== null;

/**
 * Build the packaged AppLovin HTML once and return its contents.
 * applovin = mraid:true, so the HTML references mraid.js and uses the
 * mraidDeferBootGate (needs mraid.getState/isViewable/addEventListener).
 */
async function packAppLovinHtml(): Promise<string> {
  const f = FIXTURE!;
  if (existsSync(f.outputDir)) rmSync(f.outputDir, { recursive: true, force: true });
  mkdirSync(f.outputDir, { recursive: true });

  const result = await packageForNetworks({
    buildDir: f.buildDir,
    outputDir: f.outputDir,
    networks: ['applovin'],
    config: {
      orientation: f.orientation,
      storeUrlIos: 'https://apps.apple.com/app/plbx-test',
      storeUrlAndroid: 'https://play.google.com/store/apps/details?id=ai.plbx.test',
    },
  });
  const html = result.results.find((r) => r.format === 'html');
  if (!html || !existsSync(html.outputPath)) {
    throw new Error('applovin HTML was not produced');
  }
  return readFileSync(html.outputPath, 'utf-8');
}

// ── Injected-into-iframe scripts ─────────────────────────────────────────────
// These are prepended to the packaged HTML *string* before it becomes the
// srcdoc, because a null-origin iframe is cross-context and can't be read or
// scripted from the parent. This mirrors the manual repro technique.

/**
 * Minimal MRAID mock the playable expects. state 'default', isViewable()=true so
 * the mraidDeferBootGate boots immediately. open() is a CTA no-op.
 */
const MRAID_MOCK = `<script>(function(){
  var listeners = {};
  window.mraid = {
    getState: function(){ return 'default'; },
    isViewable: function(){ return true; },
    addEventListener: function(ev, fn){ (listeners[ev] = listeners[ev] || []).push(fn); if (ev === 'ready') { setTimeout(fn, 0); } },
    removeEventListener: function(ev, fn){ var a = listeners[ev]; if (a) { var i = a.indexOf(fn); if (i >= 0) a.splice(i,1); } },
    open: function(url){ /* CTA no-op in test */ },
    close: function(){},
    getPlacementType: function(){ return 'interstitial'; },
    getVersion: function(){ return '3.0'; },
    useCustomClose: function(){},
    expand: function(){},
    fireEvent: function(ev){ var a = listeners[ev] || []; for (var i=0;i<a.length;i++) try { a[i](); } catch(e){} }
  };
})();</script>`;

/**
 * postMessage bridge: a null-origin iframe can't be read cross-origin, so we
 * pump console/errors + a periodic boot-status probe out to the parent.
 */
const BRIDGE = `<script>(function(){
  function post(type, payload){ try { parent.postMessage({ __plbx: true, type: type, payload: payload }, '*'); } catch(e){} }
  ['log','warn','error'].forEach(function(level){
    var orig = console[level] ? console[level].bind(console) : function(){};
    console[level] = function(){
      try { post('console', { level: level, text: Array.prototype.map.call(arguments, String).join(' ') }); } catch(e){}
      return orig.apply(null, arguments);
    };
  });
  window.addEventListener('error', function(e){ post('pageerror', { message: (e && e.message) || String(e), stack: e && e.error && e.error.stack }); });
  window.addEventListener('unhandledrejection', function(e){ post('pageerror', { message: 'unhandledrejection: ' + ((e && e.reason && e.reason.message) || String(e && e.reason)) }); });
  // Boot-status probe — the success condition both bugs break.
  setInterval(function(){
    try {
      var cc = window.cc;
      post('status', {
        hasCc: !!cc,
        inited: !!(cc && cc.game && cc.game._inited === true),
        hasScene: !!(cc && cc.director && cc.director.getScene && cc.director.getScene())
      });
    } catch(e) { post('status', { error: String(e) }); }
  }, 200);
})();</script>`;

interface Status { hasCc: boolean; inited: boolean; hasScene: boolean; error?: string; }

/**
 * Load the packaged HTML the SAME WAY the AppLovin validator does:
 *   tiny data: host page -> <iframe sandbox="allow-scripts" srcdoc="FULL_HTML">.
 * Returns the collected status + logs from inside the null-origin iframe.
 */
async function bootInSandbox(
  browser: Browser,
  packagedHtml: string,
  timeoutMs: number,
): Promise<{ last: Status | null; logs: string[]; errors: string[]; netRequests: string[] }> {
  // Prepend mock + bridge INTO the iframe content (null-origin: can't inject from parent).
  const iframeHtml = packagedHtml.replace(/<head([^>]*)>/i, `<head$1>${MRAID_MOCK}${BRIDGE}`);
  const finalHtml = /<head/i.test(packagedHtml) ? iframeHtml : MRAID_MOCK + BRIDGE + packagedHtml;

  const page: Page = await browser.newPage();
  const logs: string[] = [];
  const errors: string[] = [];
  const netRequests: string[] = [];
  let last: Status | null = null;
  let booted: Status | null = null; // latched: the FIRST status where all three are true

  // No-network guard: a self-contained playable must NEVER fetch its assets over
  // the network — everything is in the inline ZIP. Capture any real http(s)
  // request (the host page is set via setContent and loads nothing remote, so
  // ANY http(s) request here is a leak).
  page.on('request', (req) => {
    const u = req.url();
    if (/^https?:\/\//i.test(u)) netRequests.push(u);
  });

  // Drain console/error/status messages forwarded from the sandboxed iframe.
  // We latch `booted` instead of snapshotting `last` at deadline, because the
  // engine boots asynchronously over many ticks (slow under software-GL) and a
  // plain last-write snapshot races with the success tick.
  await page.exposeFunction('__plbxReceive', (msg: any) => {
    if (!msg || !msg.__plbx) return;
    if (msg.type === 'console') logs.push(`[${msg.payload.level}] ${msg.payload.text}`);
    else if (msg.type === 'pageerror') errors.push(msg.payload.message);
    else if (msg.type === 'status') {
      const s = msg.payload as Status;
      last = s;
      if (!booted && s.hasCc && s.inited && s.hasScene) booted = s;
    }
  });

  // Outer host page: a real-origin page that only injects the sandboxed iframe.
  // sandbox="allow-scripts" WITHOUT allow-same-origin => iframe origin = "null".
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"></head><body>
       <script>window.addEventListener('message', function(e){ window.__plbxReceive(e.data); });</script>
       <iframe id="ad" sandbox="allow-scripts" style="width:400px;height:700px;border:0"></iframe>
     </body></html>`,
    { waitUntil: 'domcontentloaded' },
  );

  // Set srcdoc with the full packaged HTML (+ injected mock/bridge).
  await page.evaluate((html: string) => {
    const f = document.getElementById('ad') as HTMLIFrameElement;
    f.srcdoc = html;
  }, finalHtml);

  // Poll until the booted latch trips (success) or the deadline passes.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (booted) break;
    await page.waitForTimeout(250);
  }

  await page.close();
  return { last, logs, errors, netRequests };
}

interface BootResult { last: Status | null; logs: string[]; errors: string[]; netRequests: string[]; }

function summarize(tag: string, r: BootResult) {
  // eslint-disable-next-line no-console
  console.log(`  [${tag}] status=${JSON.stringify(r.last)} logs=${r.logs.length} errors=${r.errors.length} net=${r.netRequests.length}`);
  if (r.errors.length) r.errors.slice(0, 5).forEach((e) => console.log('    ! ' + String(e).slice(0, 200)));
  if (r.netRequests.length) r.netRequests.slice(0, 5).forEach((u) => console.log('    🌐 ' + u));
}

// Shared assertions for the boot success condition.
function expectBooted(r: BootResult, engine: string) {
  expect(r.last, `[${engine}] never received a boot-status message from the sandboxed iframe`).not.toBeNull();
  // window.cc must exist (importmap `cc` must resolve — bug #1).
  expect(r.last!.hasCc, `[${engine}] window.cc missing — SystemJS could not resolve 'cc' (bug #1: about:cocos-js/cc.js)`).toBe(true);
  // cc.game._inited must flip true (bug #2: WebKit on* handler never fired -> init Promise hung).
  expect(r.last!.inited, `[${engine}] cc.game._inited never became true — cc.game.init() Promise hung (bug #2: WebKit xhr.onload)`).toBe(true);
  // scene must actually load.
  expect(r.last!.hasScene, `[${engine}] cc.director.getScene() falsy — scene never loaded (gray screen)`).toBe(true);
  // No-network: a self-contained playable must not fetch anything over http(s).
  expect(r.netRequests, `[${engine}] playable hit the network (must be fully offline): ${r.netRequests.join(', ')}`).toEqual([]);
}

// ── WebKit: the iOS-representative engine (catches bug #1 AND bug #2) ─────────
// Probe webkit availability up-front; describe.skip with a clear reason if the
// binary isn't installed, so a normal `vitest run` doesn't fail.
let WEBKIT_OK = false;
let WEBKIT_SKIP_REASON = '';
async function probeBrowser(type: BrowserType): Promise<boolean> {
  try {
    const b = await type.launch({ headless: true });
    await b.close();
    return true;
  } catch (e: any) {
    WEBKIT_SKIP_REASON = e?.message?.slice(0, 200) || 'launch failed';
    return false;
  }
}

const describeWebkit = (HAS_BUILD ? describe : describe.skip);

describeWebkit('iOS AppLovin validator (WebKit, null-origin srcdoc)', () => {
  let browser: Browser | null = null;
  let html = '';

  beforeAll(async () => {
    WEBKIT_OK = await probeBrowser(webkit);
    if (!WEBKIT_OK) {
      console.warn(`  [webkit] SKIPPED — webkit unavailable: ${WEBKIT_SKIP_REASON}. Run: npx playwright install webkit`);
      return;
    }
    html = await packAppLovinHtml();
    browser = await webkit.launch({ headless: true });
  }, 120000);

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it('boots Cocos + loads scene inside sandbox="allow-scripts" srcdoc iframe', async () => {
    if (!WEBKIT_OK) {
      // Mark as skipped at runtime when the engine is unavailable.
      console.warn('  [webkit] test skipped: webkit binary not installed');
      return;
    }
    const r = await bootInSandbox(browser!, html, 15000);
    summarize('webkit', r);
    expectBooted(r, 'webkit');
  }, 60000);
});

// ── Chromium variant: keeps null-origin (bug #1) coverage even without WebKit ─
// Chromium CANNOT catch the WebKit-specific bug #2 (it routes synthetic 'load'
// to the on* attribute handler), but it DOES catch bug #1 (about: importmap
// target). This guarantees the harness + bug #1 stay guarded on CI machines
// that only have chromium.
const describeChromium = (HAS_BUILD ? describe : describe.skip);

describeChromium('iOS validator harness (Chromium, null-origin srcdoc — bug #1 guard)', () => {
  let browser: Browser | null = null;
  let html = '';
  let ok = false;

  beforeAll(async () => {
    ok = await probeBrowser(chromium);
    if (!ok) {
      console.warn('  [chromium] SKIPPED — chromium unavailable. Run: npx playwright install chromium');
      return;
    }
    html = await packAppLovinHtml();
    // SwiftShader gives software WebGL in headless; without it Cocos bails on
    // canvas.getContext('webgl') === null before the scene loads.
    browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
    });
  }, 120000);

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it('boots Cocos in null-origin srcdoc iframe (resolves importmap `cc` — bug #1)', async () => {
    if (!ok) {
      console.warn('  [chromium] test skipped: chromium binary not installed');
      return;
    }
    const r = await bootInSandbox(browser!, html, 15000);
    summarize('chromium', r);
    expectBooted(r, 'chromium');
  }, 60000);

  it('packaged HTML is Facebook-safe: no XMLHttpRequest, engine uses _XMLLocalRequest/_createLocalJSElement', async () => {
    if (!ok) { console.warn('  [chromium] test skipped'); return; }
    // Facebook blocks/rewrites the XMLHttpRequest literal (→ _xrq_) and locks a
    // dynamically-loaded <script>'s src ("Cannot redefine property: src"). The
    // self-contained build must contain NO standalone XMLHttpRequest
    // (getXMLHttpRequest method names are fine — \b boundary), and the engine's
    // XHR + bundle-script loading must be rewritten to our cache-served shims.
    expect(html, 'standalone XMLHttpRequest leaked (FB blocks it)').not.toMatch(/\bXMLHttpRequest\b/);
    expect(html, 'engine not rewritten to _XMLLocalRequest').toContain('_XMLLocalRequest');
    expect(html, 'engine bundle loader not rewritten to _createLocalJSElement').toContain('_createLocalJSElement');
    // NOTE: feature-detection `'x' in document.createElement('script')` in the
    // inlined system.bundle.js/polyfills is intentionally NOT rewritten (it never
    // sets .src / appends, so FB's runtime script-src lock is not triggered).
    // Eliminating it entirely would require forking system.bundle.js (super-html
    // does this); tracked as a follow-up if FB's static scan rejects it.
  }, 60000);

  it('legacy-pinned network still boots in sandbox (rollback path)', async () => {
    if (!ok) { console.warn('  [chromium] test skipped'); return; }
    const f = FIXTURE!;
    if (existsSync(f.outputDir)) rmSync(f.outputDir, { recursive: true, force: true });
    mkdirSync(f.outputDir, { recursive: true });
    const result = await packageForNetworks({
      buildDir: f.buildDir,
      outputDir: f.outputDir,
      networks: ['applovin'],
      config: {
        orientation: f.orientation,
        storeUrlIos: 'https://apps.apple.com/app/plbx-test',
        storeUrlAndroid: 'https://play.google.com/store/apps/details?id=ai.plbx.test',
        loaderMode: 'self-contained',
        legacyLoaderNetworks: ['applovin'],
      },
    });
    const legacyHtml = readFileSync(result.results.find((r) => r.format === 'html')!.outputPath, 'utf-8');
    // Pinning forces the legacy SystemJS loader for this network.
    expect(legacyHtml).toContain('window.XMLHttpRequest =');
    const r = await bootInSandbox(browser!, legacyHtml, 15000);
    summarize('chromium-legacy', r);
    expectBooted(r, 'chromium-legacy');
  }, 90000);
});
