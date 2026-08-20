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

  // Moloco/Facebook moderation substring-scans the raw HTML and rejects any
  // 'mraid.js' occurrence — even inside a JS comment or a conditional (builds
  // from pre-split-token packagers leaked it exactly that way). The preview
  // validator must surface that statically via forbiddenLiterals.
  it('flags mraid.js literals in a non-MRAID build via forbiddenLiterals', async () => {
    mkdirSync(join(TMP, 'moloco'), { recursive: true });
    writeFileSync(join(TMP, 'moloco', 'index.html'),
      '<html><body><script>// SDK\'s mraid.js note\n' +
      "if (u.indexOf('mraid.js') !== -1) {}</script></body></html>");
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'),
      '<html><head><script src="mraid.js"></script></head><body></body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['moloco', 'applovin'] });
    const data = JSON.parse((await httpGet(url + '/api/networks')).body);
    const moloco = data.find((n: { id: string }) => n.id === 'moloco');
    const applovin = data.find((n: { id: string }) => n.id === 'applovin');

    expect(moloco.forbiddenLiterals).toEqual(['mraid.js']);
    expect(moloco.checks.map((c: { id: string }) => c.id)).toContain('no_forbidden_literals');
    // MRAID networks legitimately ship the tag — no check def, empty scan.
    expect(applovin.forbiddenLiterals).toEqual([]);
    expect(applovin.checks.map((c: { id: string }) => c.id)).not.toContain('no_forbidden_literals');
  });

  // molocoV2 launcher-payload: the launcher is a <3 KB tag with no loader — the
  // loader ships inside payload.js as an ESCAPED JS string ('\\.' on disk where
  // the plain loader has '\.'). Loader-health must scan launcher + unescaped
  // payload; scanning the launcher alone used to fail all three fingerprints.
  it('scans payload.js for loader-health on launcher-payload networks', async () => {
    mkdirSync(join(TMP, 'molocoV2'), { recursive: true });
    writeFileSync(join(TMP, 'molocoV2', 'launcher.html'),
      '<html><head></head><body><script src="#PAYLOAD_URL#"></script></body></html>');
    writeFileSync(join(TMP, 'molocoV2', 'payload.js'),
      "var h = 'plbx loader v0.3.5\\n" +
      "function __plbx_pre_boot() { poll(1); if (innerWidth && document.visibilityState) {} }\\n" +
      "function _isVirtualScheme(u) { return /^(\\\\.\\\\/)?(chunks|virtual|blob|data|about):/.test(u); }';");

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['molocoV2'] });
    const data = JSON.parse((await httpGet(url + '/api/networks')).body);
    const lh = data[0].loaderHealth as Array<{ id: string; pass: boolean; detail: string }>;
    expect(lh.length).toBeGreaterThan(0);
    for (const c of lh) expect(c.pass, `${c.id}: ${c.detail}`).toBe(true);
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

  it('should position the manual-triggers dock in the top-left corner', async () => {
    mkdirSync(join(TMP, 'molocoV2'), { recursive: true });
    writeFileSync(join(TMP, 'molocoV2', 'index.html'), '<html><head></head><body>m</body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['molocoV2'] });
    const res = await httpGet(url + '/static/preview/preview.css');
    expect(res.status).toBe(200);
    const dockRule = res.body.match(/\.mv2-dock\s*\{[^}]*\}/);
    expect(dockRule).not.toBeNull();
    expect(dockRule![0]).toMatch(/top:/);
    expect(dockRule![0]).toMatch(/left:/);
    expect(dockRule![0]).not.toMatch(/bottom:/);
    expect(dockRule![0]).not.toMatch(/right:/);
  });

  it('should include a viewable hint with pulse styling for molocoV2 manual trigger', async () => {
    mkdirSync(join(TMP, 'molocoV2'), { recursive: true });
    writeFileSync(join(TMP, 'molocoV2', 'index.html'), '<html><head></head><body>m</body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['molocoV2'] });

    const html = await httpGet(url + '/');
    expect(html.status).toBe(200);
    expect(html.body).toContain('mv2-viewable-hint');
    expect(html.body).toContain('Press Viewable to simulate the ad container becoming visible');

    const css = await httpGet(url + '/static/preview/preview.css');
    expect(css.body).toContain('.mv2-viewable-hint');
    expect(css.body).toContain('.mv2-btn-pulse');

    const js = await httpGet(url + '/static/preview/preview.js');
    expect(js.status).toBe(200);
    expect(js.body).toContain('mv2-viewable-hint');
    expect(js.body).toContain('mv2-btn-pulse');
  });

  // The Luna panel is a client-side mirror of the kit's validateLunaEvents():
  // markup ids + the client logic that feeds them. Statics are network-agnostic,
  // so any served build is enough to reach them.
  it('serves the Luna events panel markup and its client logic', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body>l</body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['applovin'] });

    const html = await httpGet(url + '/static/preview/index.html');
    expect(html.status).toBe(200);
    expect(html.body).toContain('id="luna-section"');
    // Placement matters: the Luna panel shares the LEFT column with Axon (the
    // per-network analytics slot), not the right-hand checklist sidebar.
    const left = html.body.slice(html.body.indexOf('id="left-sidebar"'));
    const leftEnd = left.indexOf('class="preview-area"');
    expect(left.slice(0, leftEnd)).toContain('id="luna-section"');
    expect(html.body).toContain('id="luna-events"');
    expect(html.body).toContain('id="luna-verdicts"');
    expect(html.body).toContain('id="luna-empty"');

    const js = await httpGet(url + '/static/preview/preview.js');
    expect(js.status).toBe(200);
    expect(js.body).toContain("case 'luna_event'");
    expect(js.body).toContain("case 'luna_lifecycle'");
    expect(js.body).toContain('computeLunaChecks');
    expect(js.body).toContain("type: 'plbx:luna'");

    const css = await httpGet(url + '/static/preview/preview.css');
    expect(css.body).toContain('.luna-event');
    expect(css.body).toContain('.luna-verdict');
  });

  // The CTA row mirrors the kit's luna-events.ts cta_via_install, which reads
  // "EVERY CTA went through InstallFullGame()". The panel used to overwrite the
  // verdict on every CTA (last-write-wins), so a session whose FIRST CTA
  // bypassed Luna and whose second routed correctly ended green and hid the
  // violation. preview.js is browser JS, so pull the pure verdict helper out of
  // the served file and drive it directly.
  it('keeps the Luna CTA verdict failed once any CTA bypassed InstallFullGame()', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body>l</body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['applovin'] });
    const js = await httpGet(url + '/static/preview/preview.js');
    expect(js.status).toBe(200);

    const src = js.body.match(/function lunaCtaVerdict\([\s\S]*?\n  \}/);
    expect(src, 'lunaCtaVerdict() must exist in the served preview.js').toBeTruthy();
    const verdict = new Function(src![0] + '; return lunaCtaVerdict;')() as
      (prev: boolean | null, viaInstall: boolean) => boolean | null;

    expect(verdict(null, true)).toBe(true);   // first CTA, routed through Luna
    const bypassed = verdict(null, false);    // first CTA bypassed Luna
    expect(bypassed).toBe(false);
    expect(verdict(bypassed, true)).toBe(false); // a later good CTA must NOT repaint it green

    // and the call site must feed the previous verdict back in, not overwrite it
    expect(js.body).toContain('lunaCtaViaInstall = lunaCtaVerdict(lunaCtaViaInstall,');
  });

  // Severity for a bypassed CTA is network-dependent. Generic networks warn (the
  // click still happens, it is just untracked by that SDK). Luna cannot afford
  // that: InstallFullGame() is the only call that raises Luna's standard Ad Click,
  // and Luna re-exports the creative to every downstream network from that one
  // signal — so a bypassed CTA is invisible everywhere, which is what the kit's
  // cta_via_install already calls an error.
  it('fails (not warns) the CTA checklist row when a Luna CTA bypasses InstallFullGame()', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body>l</body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['applovin'] });
    const js = await httpGet(url + '/static/preview/preview.js');
    expect(js.status).toBe(200);

    expect(js.body).toContain("setCheck('cta', isLunaNetwork ? 'fail' : 'warn'");
    // the passing branch stays network-agnostic
    expect(js.body).toContain("setCheck('cta', 'pass'");
  });

  // The mock fires adLoading/adReady/adStarting BEFORE startGame() because that
  // is exactly when Luna fires them — they are Luna's own events, not the
  // game's. The before-start rule is about the CUSTOM events the creative logs
  // ("avoid logging any event during the initialisation phase"), so applying it
  // to every event failed the row on every conforming Luna build.
  it('applies the Luna before-startGame rule to custom events only', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body>l</body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['applovin'] });
    const js = await httpGet(url + '/static/preview/preview.js');
    expect(js.status).toBe(200);

    const src = js.body.match(/function lunaEarlyEvents\([\s\S]*?\n  \}/);
    expect(src, 'lunaEarlyEvents() must exist in the served preview.js').toBeTruthy();
    const early = new Function(src![0] + '; return lunaEarlyEvents;')() as
      (order: string[], events: Record<string, { kind: string; beforeStart: boolean }>) => string[];

    const events = {
      adLoading: { kind: 'standard', beforeStart: true },
      adReady: { kind: 'standard', beforeStart: true },
      level_1: { kind: 'custom', beforeStart: false },
    };
    // a conforming build: only Luna's own standard events precede startGame()
    expect(early(['adLoading', 'adReady', 'level_1'], events)).toEqual([]);

    // a real violation: the game logged its own event during initialisation
    const bad = { ...events, boot_ping: { kind: 'custom', beforeStart: true } };
    expect(early(['adLoading', 'boot_ping', 'level_1'], bad)).toEqual(['boot_ping']);

    // and the verdict must be computed through it, not from a raw beforeStart scan
    expect(js.body).toContain('lunaEarlyEvents(lunaOrder, lunaEvents)');
  });

  // Luna's 256-per-session budget is spent by the events the GAME authors. The
  // six standard events are simulated locally only because Luna injects the real
  // ones at export, so counting them inflated the cap verdict and the footer.
  it('charges only custom events against the Luna session total', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body>l</body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['applovin'] });
    const js = await httpGet(url + '/static/preview/preview.js');

    const src = js.body.match(/function lunaNextTotal\([\s\S]*?\n  \}/);
    expect(src, 'lunaNextTotal() must exist in the served preview.js').toBeTruthy();
    const nextTotal = new Function(src![0] + '; return lunaNextTotal;')() as
      (prev: number, data: { kind?: string; total?: number }) => number;

    // no authoritative counter from the mock: standard events cost nothing
    expect(nextTotal(0, { kind: 'standard' })).toBe(0);
    expect(nextTotal(3, { kind: 'standard' })).toBe(3);
    expect(nextTotal(3, { kind: 'custom' })).toBe(4);
    // the mock's own counter still wins when it carries one
    expect(nextTotal(3, { kind: 'custom', total: 9 })).toBe(9);

    expect(js.body).toContain('lunaTotal = lunaNextTotal(lunaTotal, data)');
    // the footer is the session budget, spelled as what it counts
    expect(js.body).toContain("' custom events this session'");
  });

  // getNetworkChecks('luna') contributes `start_game` and `luna_events`, and the
  // 30s sweep fails every row still 'pending'. Nothing fed either one, so both
  // auto-failed on a CONFORMING build and the checklist lied. They are satisfied
  // from signals that already arrive: the mock's startGame lifecycle report and
  // the Luna verdicts.
  it('satisfies the Luna start_game row from the mock lifecycle report', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body>l</body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['applovin'] });
    const js = await httpGet(url + '/static/preview/preview.js');

    // the lifecycle report passes the row
    expect(js.body).toMatch(/data\.name === 'startGame'[\s\S]{0,160}setCheck\('start_game', 'pass'/);

    // and the mock's give-up report fails it
    const src = js.body.match(/function lunaStartGameDead\([\s\S]*?\n  \}/);
    expect(src, 'lunaStartGameDead() must exist in the served preview.js').toBeTruthy();
    const dead = new Function(src![0] + '; return lunaStartGameDead;')() as
      (message: unknown) => boolean;
    expect(dead('luna: startGame() was never defined (waited 15s)')).toBe(true);
    expect(dead('luna: startGame() threw: boom')).toBe(false);
    expect(dead(undefined)).toBe(false);
    expect(js.body).toMatch(/lunaStartGameDead\(data\.message\)[\s\S]{0,120}setCheck\('start_game', 'fail'/);
  });

  it('drives the Luna luna_events row from the Luna verdicts', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body>l</body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['applovin'] });
    const js = await httpGet(url + '/static/preview/preview.js');

    const src = js.body.match(/function lunaEventsRowStatus\([\s\S]*?\n  \}/);
    expect(src, 'lunaEventsRowStatus() must exist in the served preview.js').toBeTruthy();
    const status = new Function(src![0] + '; return lunaEventsRowStatus;')() as
      (checks: Array<Record<string, unknown>>) => string;

    // nothing fired yet — computeLunaChecks() returns explicit 'pending' rows
    expect(status([{ id: 'all_conformant', status: 'pending' }])).toBe('pending');
    // every verdict green
    expect(status([{ id: 'caps_session', ok: true, level: 'error' }])).toBe('pass');
    // a warn-level failure must not paint the row red
    expect(status([
      { id: 'caps_session', ok: true, level: 'error' },
      { id: 'value_int', ok: false, level: 'warn' },
    ])).toBe('warn');
    // an error-level failure fails it
    expect(status([
      { id: 'value_int', ok: false, level: 'warn' },
      { id: 'caps_per_name', ok: false, level: 'error' },
    ])).toBe('fail');

    expect(js.body).toContain("setCheck('luna_events'");
  });

  // FINDING: a CTA-routing violation used to fail the checklist row labelled
  // "Analytics events within Luna caps" — cta_via_install was folded into the
  // array lunaEventsRowStatus() reduces, so one violation painted two rows and
  // the second lied about what it measures. CTA routing owns its own row.
  it('keeps the Luna luna_events row about events only', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body>l</body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['applovin'] });
    const js = await httpGet(url + '/static/preview/preview.js');

    const src = js.body.match(/function lunaEventsRowStatus\([\s\S]*?\n  \}/);
    expect(src, 'lunaEventsRowStatus() must exist in the served preview.js').toBeTruthy();
    const status = new Function(src![0] + '; return lunaEventsRowStatus;')() as
      (checks: Array<Record<string, unknown>>) => string;

    // an events rule failing IS this row's business
    expect(status([
      { id: 'all_conformant', ok: false, level: 'error' },
      { id: 'caps_per_name', ok: false, level: 'error' },
      { id: 'caps_session', ok: true, level: 'error' },
    ])).toBe('fail');

    // a CTA-routing violation is NOT — it has the `cta` row of its own
    expect(status([
      { id: 'all_conformant', ok: false, level: 'error' },
      { id: 'caps_per_name', ok: true, level: 'error' },
      { id: 'caps_session', ok: true, level: 'error' },
      { id: 'value_int', ok: true, level: 'warn' },
      { id: 'cta_via_install', ok: false, level: 'error' },
    ])).toBe('pass');

    // and the aggregate alone carries no signal — it is derived from the rest
    expect(status([{ id: 'all_conformant', ok: false, level: 'error' }])).toBe('pending');

    // the row's detail must not name the CTA row either
    const dsrc = js.body.match(/function lunaEventsRowDetail\([\s\S]*?\n  \}/);
    expect(dsrc, 'lunaEventsRowDetail() must exist in the served preview.js').toBeTruthy();
    const detail = new Function(dsrc![0] + '; return lunaEventsRowDetail;')() as
      (checks: Array<Record<string, unknown>>) => string;
    expect(detail([
      { id: 'cta_via_install', ok: false, level: 'error', label: 'CTA via InstallFullGame()' },
      { id: 'value_int', ok: false, level: 'warn', label: 'Integer value per event' },
    ])).toBe('Integer value per event');
    expect(js.body).toContain('lunaEventsRowDetail(lunaChecks)');
  });

  // FINDING: the mock's startGame poll gives up permanently at 15s and reports
  // "startGame() was never defined". Because the mock defines window.Luna, the
  // creative's self-start fallback is off — so a slow unpack both fails the row
  // and never boots, with no recovery. The row must blame the host that gave up,
  // and the panel must point at the one control that still starts the creative.
  it('reports the Luna start_game give-up as the host giving up and offers the dock trigger', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body>l</body></html>');

    const { url } = await startPreviewServer({ outputDir: TMP, networks: ['applovin'] });
    const js = await httpGet(url + '/static/preview/preview.js');

    const src = js.body.match(/function lunaStartGameGiveUpDetail\([\s\S]*?\n  \}/);
    expect(src, 'lunaStartGameGiveUpDetail() must exist in the served preview.js').toBeTruthy();
    const detail = new Function(src![0] + '; return lunaStartGameGiveUpDetail;')() as
      (message: unknown) => string;

    const text = detail('luna: startGame() was never defined (waited 15s)');
    // honest about who gave up — not "the creative never defined it"
    expect(text).not.toContain('never defined');
    expect(text.toLowerCase()).toContain('gave up');
    expect(text).toContain('15s');            // keeps the host's own window
    expect(text).toContain('Start game');     // names the recovery control
    // no timing in the message → still an honest sentence, no "after undefined"
    expect(detail(undefined)).toContain('Start game');
    expect(detail(undefined)).not.toContain('undefined');

    // the failing branch uses that detail and arms the recovery
    expect(js.body).toMatch(
      /lunaStartGameDead\(data\.message\)[\s\S]{0,200}setCheck\('start_game', 'fail', lunaStartGameGiveUpDetail\(data\.message\)\)/);
    expect(js.body).toMatch(
      /lunaStartGameDead\(data\.message\)[\s\S]{0,240}markLunaStartGameRecovery\(true\)/);
    // and a host-driven startGame clears it again
    expect(js.body).toMatch(
      /data\.name === 'startGame'[\s\S]{0,200}markLunaStartGameRecovery\(false\)/);

    // the recovery must un-collapse the Luna dock and flag its start-game button
    const rsrc = js.body.match(/function markLunaStartGameRecovery\([\s\S]*?\n  \}/);
    expect(rsrc, 'markLunaStartGameRecovery() must exist in the served preview.js').toBeTruthy();
    expect(rsrc![0]).toContain("data-luna-action=\"start-game\"");
    expect(rsrc![0]).toContain('luna-dock');
  });

  it('should stop server cleanly', async () => {
    mkdirSync(join(TMP, 'applovin'), { recursive: true });
    writeFileSync(join(TMP, 'applovin', 'index.html'), '<html><head></head><body></body></html>');

    const { port } = await startPreviewServer({ outputDir: TMP, networks: ['applovin'] });
    await stopPreviewServer();

    await expect(httpGet('http://127.0.0.1:' + port + '/')).rejects.toThrow();
  });
});
