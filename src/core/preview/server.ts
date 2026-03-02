import http from 'http';
import { join, extname } from 'path';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import JSZip from 'jszip';
import { generatePreviewUtil } from './sdk-mocks';
import { getNetwork } from '../../shared/networks';

let _server: http.Server | null = null;
let _port = 0;

interface BuildFile {
  path: string;
  isZip: boolean;
}

function findBuildFile(outputDir: string, networkId: string): BuildFile | null {
  const dir = join(outputDir, networkId);
  if (!existsSync(dir)) return null;

  // Check for index.html first
  const indexHtml = join(dir, 'index.html');
  if (existsSync(indexHtml)) return { path: indexHtml, isZip: false };

  // Look for any .zip file
  const files = readdirSync(dir);
  const zipFile = files.find(f => f.endsWith('.zip'));
  if (zipFile) return { path: join(dir, zipFile), isZip: true };

  // Look for any .html file
  const htmlFile = files.find(f => f.endsWith('.html'));
  if (htmlFile) return { path: join(dir, htmlFile), isZip: false };

  return null;
}

async function extractHtmlFromZip(zipPath: string): Promise<string> {
  const data = readFileSync(zipPath);
  const zip = await JSZip.loadAsync(data);
  const indexFile = zip.file('index.html');
  if (!indexFile) {
    throw new Error('No index.html found in ZIP: ' + zipPath);
  }
  return indexFile.async('string');
}

function injectPreviewUtil(html: string, utilScript: string): string {
  const headIdx = html.indexOf('<head>');
  if (headIdx === -1) {
    // Try <head with attributes
    const headMatch = html.match(/<head[^>]*>/);
    if (headMatch && headMatch.index !== undefined) {
      const insertAt = headMatch.index + headMatch[0].length;
      return html.slice(0, insertAt) + '<script>' + utilScript + '</script>' + html.slice(insertAt);
    }
    // No head tag — prepend
    return '<script>' + utilScript + '</script>' + html;
  }
  const insertAt = headIdx + '<head>'.length;
  return html.slice(0, insertAt) + '<script>' + utilScript + '</script>' + html.slice(insertAt);
}

function getBuildSize(outputDir: string, networkId: string): number {
  const buildFile = findBuildFile(outputDir, networkId);
  if (!buildFile) return 0;
  try {
    return statSync(buildFile.path).size;
  } catch {
    return 0;
  }
}

// Per-network CTA method labels for the checklist
const CTA_LABELS: Record<string, string> = {
  facebook: 'CTA (FbPlayableAd.onCTAClick)',
  moloco: 'CTA (FbPlayableAd.onCTAClick)',
  google: 'CTA (ExitApi.exit)',
  mintegral: 'CTA (window.install)',
  tiktok: 'CTA (playableSDK.openAppStore)',
  pangle: 'CTA (playableSDK.openAppStore)',
  bigo: 'CTA (BGY_MRAID.open)',
  vungle: 'CTA (postMessage download)',
  mytarget: 'CTA (MTRG.onCTAClick)',
  yandex: 'CTA (yandexHTML5BannerApi)',
};

// Networks requiring full gameReady/gameStart/gameEnd/gameClose lifecycle
const FULL_LIFECYCLE = new Set(['mintegral']);

// Networks requiring gameReady + gameStart (SDK calls gameStart after gameReady)
const PARTIAL_LIFECYCLE = new Set(['tiktok', 'pangle']);

// Networks where game_end/complete is explicitly validated
const GAME_END_REQUIRED = new Set(['mintegral', 'vungle']);

interface CheckDef {
  id: string;
  label: string;
  hint?: string;
}

function getNetworkChecks(networkId: string, mraid: boolean): CheckDef[] {
  const checks: CheckDef[] = [
    { id: 'file_size', label: 'File size',
      hint: 'Reduce asset sizes: compress textures (TinyPNG), use audio compression, remove unused assets. PLBX auto-inlines everything into a single HTML.' },
    { id: 'game_loads', label: 'Game loads',
      hint: 'Check browser console for errors. Ensure all assets are inlined and no external dependencies are missing.' },
  ];

  // MRAID ready — for MRAID networks (AppLovin, Unity, ironSource, etc.)
  if (mraid) {
    checks.push({ id: 'mraid_ready', label: 'MRAID ready',
      hint: 'MRAID SDK must initialize. PLBX injects mraid.js mock automatically. If not firing, check that your code listens for mraid "ready" event.' });
  }

  // Full lifecycle: Mintegral requires gameReady → gameStart → gameEnd → gameClose
  if (FULL_LIFECYCLE.has(networkId)) {
    checks.push({ id: 'game_ready', label: 'gameReady()',
      hint: 'Call window.gameReady() when all assets are loaded and the game is ready to play. In Cocos Creator, call it in your main scene\'s onLoad or start method.' });
    checks.push({ id: 'game_start', label: 'gameStart()',
      hint: 'gameStart() is called automatically by the SDK after gameReady(). If not detected, ensure gameReady() is being called first.' });
  }

  // Partial lifecycle: TikTok/Pangle require gameReady + gameStart
  if (PARTIAL_LIFECYCLE.has(networkId)) {
    checks.push({ id: 'game_ready', label: 'gameReady()',
      hint: 'Call window.gameReady() when the game is ready. For TikTok/Pangle, also call playableSDK.reportGameReady() if using their SDK.' });
    checks.push({ id: 'game_start', label: 'gameStart()',
      hint: 'gameStart() is triggered after gameReady(). Ensure gameReady() fires correctly.' });
  }

  // CTA — with network-specific label
  const ctaLabel = CTA_LABELS[networkId] || (mraid ? 'CTA (mraid.open)' : 'CTA Call');
  const ctaHints: Record<string, string> = {
    mintegral: 'Call window.install() when the user taps the CTA button. This redirects to the app store.',
    google: 'Call ExitApi.exit() when the user taps the CTA button.',
    facebook: 'Call FbPlayableAd.onCTAClick() when the user taps the download/CTA button.',
    moloco: 'Call FbPlayableAd.onCTAClick() when the user taps the CTA button.',
    tiktok: 'Call playableSDK.openAppStore() when the user taps the CTA button.',
    pangle: 'Call playableSDK.openAppStore() when the user taps the CTA button.',
    bigo: 'Call BGY_MRAID.open(storeUrl) when the user taps the CTA button.',
    vungle: 'Call parent.postMessage("download", "*") when the user taps the CTA button.',
    mytarget: 'Call MTRG.onCTAClick() when the user taps the CTA button.',
    yandex: 'Call yandexHTML5BannerApi.getClickURLNum(1) when the user taps the CTA button.',
  };
  checks.push({ id: 'cta', label: ctaLabel,
    hint: ctaHints[networkId] || (mraid
      ? 'Call mraid.open(storeUrl) when the user taps the CTA button.'
      : 'Trigger a CTA call when the user taps the download button. Use the network-specific API.') });

  // game_end — required for Mintegral (gameEnd), Vungle (complete event)
  if (GAME_END_REQUIRED.has(networkId)) {
    checks.push({ id: 'game_end', label: 'gameEnd()',
      hint: 'Call window.gameEnd() when the gameplay is complete (e.g. level finished, time ran out). This must fire before or alongside the CTA.' });
  }

  // game_close — Mintegral only
  if (FULL_LIFECYCLE.has(networkId)) {
    checks.push({ id: 'game_close', label: 'gameClose()',
      hint: 'Call window.gameClose() when the playable ad is being closed. Typically called after CTA or at the end of the experience.' });
  }

  checks.push({ id: 'no_external', label: 'No external requests',
    hint: 'All assets must be inlined into the HTML file. PLBX does this automatically during packaging. If external requests appear, check for hardcoded URLs in your code.' });
  checks.push({ id: 'no_errors', label: 'No code exceptions',
    hint: 'Fix JavaScript errors in your game code. Check the console below for details. Common causes: missing assets, API calls to undefined objects, timing issues.' });


  return checks;
}

function extractAxonEvents(html: string): string[] {
  const events = new Set<string>();
  // Match trackEvent('name'), trackEvent("name"), trackEvent(`name`)
  const patterns = [
    /trackEvent\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /trackEvent\s*\(\s*`([^`]+)`\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      events.add(match[1]);
    }
  }
  return Array.from(events);
}

function getValidatorHtml(): string {
  // Check for static file first
  const staticPath = join(__dirname, '../../../static/preview/index.html');
  if (existsSync(staticPath)) {
    return readFileSync(staticPath, 'utf-8');
  }

  // Inline fallback
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Playbox Preview Validator</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #1a1a2e; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; height: 100vh; }
.tabs { display: flex; gap: 4px; padding: 8px; background: #16213e; border-bottom: 1px solid #0f3460; }
.tab { padding: 6px 16px; border: 1px solid #0f3460; border-radius: 4px; cursor: pointer; background: #1a1a2e; color: #a0a0c0; font-size: 13px; }
.tab.active { background: #0f3460; color: #fff; }
.tab .size { font-size: 11px; margin-left: 6px; opacity: 0.7; }
.main { display: flex; flex: 1; overflow: hidden; }
.preview-frame { flex: 1; border: none; background: #fff; }
.sidebar { width: 280px; padding: 12px; border-left: 1px solid #0f3460; overflow-y: auto; background: #16213e; }
.sidebar h3 { margin-bottom: 12px; font-size: 14px; color: #7ec8e3; }
.check-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #0f3460; }
.check-icon { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
.check-icon.pending { background: #333; color: #888; }
.check-icon.pass { background: #1b5e20; color: #4caf50; }
.check-icon.fail { background: #b71c1c; color: #ef5350; }
.console { height: 150px; border-top: 1px solid #0f3460; background: #0d1117; padding: 8px; overflow-y: auto; font-family: monospace; font-size: 12px; }
.console-line { padding: 2px 0; color: #8b949e; }
.console-line.error { color: #f85149; }
.console-line.success { color: #3fb950; }
.console-line.info { color: #58a6ff; }
</style>
</head>
<body>
<div class="tabs" id="tabs"></div>
<div class="main">
  <iframe class="preview-frame" id="preview-frame" sandbox="allow-scripts allow-same-origin"></iframe>
  <div class="sidebar">
    <h3 id="sidebar-title">Validation Checklist</h3>
    <div id="checklist"></div>
  </div>
</div>
<div class="console" id="console"></div>
<script>
(function() {
  var checks = {
    file_size: { label: 'File size within limit', status: 'pending' },
    game_loads: { label: 'Game loads', status: 'pending' },
    game_ready: { label: 'Game Ready', status: 'pending' },
    game_start: { label: 'Game Start', status: 'pending' },
    cta: { label: 'CTA triggered', status: 'pending' },
    game_close: { label: 'Game Close', status: 'pending' },
    no_external: { label: 'No external requests', status: 'pending' },
    no_errors: { label: 'No exceptions', status: 'pending' }
  };
  var networks = [];
  var currentNetwork = null;
  var timeoutId = null;

  function renderChecklist() {
    var container = document.getElementById('checklist');
    while (container.firstChild) container.removeChild(container.firstChild);
    var keys = Object.keys(checks);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var check = checks[key];
      var item = document.createElement('div');
      item.className = 'check-item';
      var icon = document.createElement('div');
      icon.className = 'check-icon ' + check.status;
      icon.textContent = check.status === 'pass' ? '\u2713' : check.status === 'fail' ? '\u2717' : '\u2022';
      var label = document.createElement('span');
      label.textContent = check.label;
      item.appendChild(icon);
      item.appendChild(label);
      container.appendChild(item);
    }
  }

  function log(msg, cls) {
    var container = document.getElementById('console');
    var line = document.createElement('div');
    line.className = 'console-line' + (cls ? ' ' + cls : '');
    var time = new Date().toLocaleTimeString();
    line.textContent = '[' + time + '] ' + msg;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  }

  function setCheck(name, status) {
    if (checks[name]) {
      checks[name].status = status;
      renderChecklist();
    }
  }

  function loadNetwork(id) {
    currentNetwork = id;
    // Reset checks
    var keys = Object.keys(checks);
    for (var i = 0; i < keys.length; i++) checks[keys[i]].status = 'pending';

    // Check file size
    var net = null;
    for (var j = 0; j < networks.length; j++) {
      if (networks[j].id === id) { net = networks[j]; break; }
    }
    if (net) {
      setCheck('file_size', net.size <= net.maxSize ? 'pass' : 'fail');
      log('File size: ' + (net.size / 1024).toFixed(1) + ' KB / ' + (net.maxSize / 1024 / 1024).toFixed(1) + ' MB max', net.size <= net.maxSize ? 'success' : 'error');
    }

    // Set no_external and no_errors to pass initially
    setCheck('no_external', 'pass');
    setCheck('no_errors', 'pass');

    renderChecklist();
    log('Loading preview for: ' + id, 'info');

    var frame = document.getElementById('preview-frame');
    frame.src = '/preview/' + id;

    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(function() {
      var keys2 = Object.keys(checks);
      for (var k = 0; k < keys2.length; k++) {
        if (checks[keys2[k]].status === 'pending') {
          setCheck(keys2[k], 'fail');
          log('Timeout: ' + checks[keys2[k]].label, 'error');
        }
      }
    }, 30000);

    // Update active tab
    var tabs = document.getElementById('tabs').children;
    for (var t = 0; t < tabs.length; t++) {
      if (tabs[t].dataset && tabs[t].dataset.id === id) {
        tabs[t].className = 'tab active';
      } else {
        tabs[t].className = 'tab';
      }
    }
  }

  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'plbx:preview') return;
    var evt = e.data.event;
    var data = e.data.data || {};
    log('Event: ' + evt + (data.method ? ' (' + data.method + ')' : ''), 'info');

    if (evt === 'preview_loaded') {
      setCheck('game_loads', 'pass');
    } else if (evt === 'game_ready') {
      setCheck('game_ready', 'pass');
    } else if (evt === 'game_start') {
      setCheck('game_start', 'pass');
    } else if (evt === 'cta') {
      setCheck('cta', 'pass');
    } else if (evt === 'game_close') {
      setCheck('game_close', 'pass');
    } else if (evt === 'external_request') {
      setCheck('no_external', 'fail');
      log('External request: ' + (data.url || ''), 'error');
    } else if (evt === 'error') {
      setCheck('no_errors', 'fail');
      log('Error: ' + (data.message || ''), 'error');
    }
  });

  // Load networks
  fetch('/api/networks').then(function(r) { return r.json(); }).then(function(data) {
    networks = data;
    var tabsContainer = document.getElementById('tabs');
    for (var i = 0; i < data.length; i++) {
      var tab = document.createElement('div');
      tab.className = 'tab';
      tab.dataset.id = data[i].id;
      var nameSpan = document.createElement('span');
      nameSpan.textContent = data[i].name;
      tab.appendChild(nameSpan);
      var sizeSpan = document.createElement('span');
      sizeSpan.className = 'size';
      sizeSpan.textContent = (data[i].size / 1024).toFixed(0) + ' KB';
      tab.appendChild(sizeSpan);
      tab.addEventListener('click', (function(id) { return function() { loadNetwork(id); }; })(data[i].id));
      tabsContainer.appendChild(tab);
    }
    if (data.length > 0) loadNetwork(data[0].id);
  });

  renderChecklist();
})();
</script>
</body>
</html>`;
}

export async function startPreviewServer(options: { outputDir: string; networks: string[] }): Promise<{ port: number; url: string }> {
  // Stop existing server if running
  if (_server) {
    await stopPreviewServer();
  }

  const { outputDir, networks } = options;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = req.url || '/';

      try {
        // GET / — Validator UI
        if (url === '/' || url === '/index.html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getValidatorHtml());
          return;
        }

        // GET /api/networks
        if (url === '/api/networks') {
          const VALIDATOR_URLS: Record<string, string> = {
            applovin: 'https://p.applov.in/playablePreview?create=1&qr=1',
            facebook: 'https://developers.facebook.com/tools/playable-preview/',
            google: 'https://h5validator.appspot.com/dcm/asset',
            mintegral: 'https://www.mindworks-creative.com/review/',
            vungle: 'https://vungle.com/creative-verifier/',
            tiktok: 'https://ads.tiktok.com/help/article/playable-ad-specifications',
            pangle: 'https://ads.tiktok.com/help/article/playable-ad-specifications',
          };

          const result = networks.map(id => {
            const config = getNetwork(id);
            const checks = getNetworkChecks(id, config?.mraid || false);
            return {
              id,
              name: config?.name || id,
              format: config?.format || 'html',
              mraid: config?.mraid || false,
              maxSize: config?.maxSize || 0,
              size: getBuildSize(outputDir, id),
              checks,
              validatorUrl: VALIDATOR_URLS[id] || null,
            };
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // GET /api/axon-events/{networkId} — extract trackEvent calls from source
        const axonMatch = url.match(/^\/api\/axon-events\/([a-zA-Z0-9_-]+)$/);
        if (axonMatch) {
          const networkId = axonMatch[1];
          const buildFile = findBuildFile(outputDir, networkId);
          if (!buildFile) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ events: [] }));
            return;
          }
          let html: string;
          if (buildFile.isZip) {
            html = await extractHtmlFromZip(buildFile.path);
          } else {
            html = readFileSync(buildFile.path, 'utf-8');
          }
          const events = extractAxonEvents(html);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ events }));
          return;
        }

        // GET /preview/{networkId}
        const previewMatch = url.match(/^\/preview\/([a-zA-Z0-9_-]+)$/);
        if (previewMatch) {
          const networkId = previewMatch[1];
          const config = getNetwork(networkId);
          const buildFile = findBuildFile(outputDir, networkId);

          if (!buildFile) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Build not found for network: ' + networkId);
            return;
          }

          let html: string;
          if (buildFile.isZip) {
            html = await extractHtmlFromZip(buildFile.path);
          } else {
            html = readFileSync(buildFile.path, 'utf-8');
          }

          const utilScript = generatePreviewUtil({
            networkId,
            mraid: config?.mraid || false,
            maxSize: config?.maxSize || 0,
          });

          const injectedHtml = injectPreviewUtil(html, utilScript);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(injectedHtml);
          return;
        }

        // GET /mraid.js — empty mock
        if (url === '/mraid.js') {
          res.writeHead(200, { 'Content-Type': 'application/javascript' });
          res.end('/* MRAID mock — handled by preview-util.js */');
          return;
        }

        // GET /static/* — serve static files
        if (url.startsWith('/static/')) {
          const filePath = join(__dirname, '../../../', url);
          if (existsSync(filePath)) {
            const ext = extname(filePath);
            const mimeMap: Record<string, string> = {
              '.html': 'text/html; charset=utf-8',
              '.css': 'text/css; charset=utf-8',
              '.js': 'application/javascript; charset=utf-8',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.svg': 'image/svg+xml',
            };
            res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
            res.end(readFileSync(filePath));
            return;
          }
        }

        // 404
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server error: ' + (err.message || String(err)));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        _port = addr.port;
        _server = server;
        resolve({ port: _port, url: `http://127.0.0.1:${_port}` });
      } else {
        reject(new Error('Failed to get server address'));
      }
    });

    server.on('error', reject);
  });
}

export async function stopPreviewServer(): Promise<void> {
  return new Promise((resolve) => {
    if (_server) {
      _server.close(() => {
        _server = null;
        _port = 0;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
