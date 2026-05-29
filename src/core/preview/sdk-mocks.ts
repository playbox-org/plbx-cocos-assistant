export interface PreviewUtilParams {
  networkId: string;
  mraid: boolean;
  maxSize: number;
}

/**
 * The CTA method the REAL network validator tracks for this network. Our mock
 * tags each 'cta' report with whether the method matches — so the validator
 * shows the TRUTH (did the game reach the network's CTA SDK?) instead of
 * counting a bare window.open() (blocked/untracked in real ad sandboxes) as a
 * success. Keep in sync with the bridges in network-adapters/base.ts.
 */
function expectedCtaMethod(networkId: string, mraid: boolean): string {
  const MAP: Record<string, string> = {
    facebook: 'fbplayable',
    moloco: 'fbplayable',
    molocoV2: 'mraid.open',
    google: 'exitapi',
    mintegral: 'install',
    tiktok: 'playable_sdk',
    pangle: 'playable_sdk',
    vungle: 'vungle_download',
    bigo: 'bgy_mraid',
    mytarget: 'mtrg',
  };
  return MAP[networkId] || (mraid ? 'mraid.open' : 'window.open');
}

export function generatePreviewUtil(params: PreviewUtilParams): string {
  const { networkId, mraid } = params;
  const parts: string[] = [];
  const expectedCta = expectedCtaMethod(networkId, mraid);

  // Phase 1: Reporting
  parts.push(`
(function() {
  var _plbxEvents = [];
  var _plbxExpectedCta = ${JSON.stringify(expectedCta)};
  function report(event, data) {
    // Tag CTA events with whether the call matched the network's REAL CTA SDK
    // method. A bare window.open() on an SDK network is NOT a tracked CTA —
    // marking it correct:false stops the validator showing a false success.
    if (event === 'cta') {
      data = data || {};
      data.expected = _plbxExpectedCta;
      data.correct = data.method === _plbxExpectedCta;
    }
    _plbxEvents.push({ event: event, data: data, time: Date.now() });
    try {
      parent.postMessage({ type: 'plbx:preview', event: event, data: data || {} }, '*');
    } catch(e) {}
  }
  window.__plbxReport = report;
`);

  // Phase 2: Error tracking
  parts.push(`
  var _errors = [];
  window.onerror = function(msg, src, line, col, err) {
    _errors.push({ message: String(msg), source: src, line: line });
    report('error', { message: String(msg), source: src, line: line, col: col });
  };
  window.addEventListener('unhandledrejection', function(e) {
    var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unknown rejection';
    _errors.push({ message: msg });
    report('error', { message: msg });
  });
`);

  // Phase 3: Network request tracking + MOLOCO_MACROS fire detection
  parts.push(`
  var _requests = [];
  var _whitelist = [location.hostname, 'localhost', '127.0.0.1', ''];

  function isExternal(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) return false;
    try {
      var h = new URL(url, location.href).hostname;
      return _whitelist.indexOf(h) === -1;
    } catch(e) { return false; }
  }

  // ---- MOLOCO_MACROS reverse-lookup ----
  // Built lazily on first fire so we capture the launcher's MOLOCO_MACROS values
  // (DSP substitutes the #...# placeholders before serving). The lookup maps both
  // the raw encoded value and the decoded value back to the macro key — adapter
  // implementations may use either form.
  var _macroLookup = null;
  function _buildMacroLookup() {
    var M = window.MOLOCO_MACROS;
    if (!M) return null;
    var L = {};
    for (var k in M) {
      if (!Object.prototype.hasOwnProperty.call(M, k)) continue;
      var raw = M[k];
      if (!raw || typeof raw !== 'string') continue;
      L[raw] = k;
      try { L[decodeURIComponent(raw)] = k; } catch(e) {}
    }
    return L;
  }
  function _macroKeyForUrl(url) {
    if (!url || typeof url !== 'string') return null;
    if (_macroLookup === null) _macroLookup = _buildMacroLookup();
    if (!_macroLookup) return null;
    if (_macroLookup[url]) return _macroLookup[url];
    try {
      var d = decodeURIComponent(url);
      if (_macroLookup[d]) return _macroLookup[d];
    } catch(e) {}
    return null;
  }
  function _logMacroFire(url, channel) {
    var key = _macroKeyForUrl(url);
    if (!key) return;
    var stack = '';
    try { stack = (new Error()).stack || ''; } catch(e) {}
    report('macro_fire', {
      macroKey: key,
      url: url,
      channel: channel,
      ts: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
      stack: stack.split('\\n').slice(2, 6).join('\\n')
    });
  }

  // Wrap XMLHttpRequest
  var _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    var u = String(url);
    _requests.push(u);
    _logMacroFire(u, 'xhr');
    if (isExternal(u)) report('external_request', { url: u });
    return _xhrOpen.apply(this, arguments);
  };

  // Wrap fetch
  if (window.fetch) {
    var _origFetch = window.fetch;
    window.fetch = function(input) {
      var u = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      _requests.push(u);
      _logMacroFire(u, 'fetch');
      if (isExternal(u)) report('external_request', { url: u });
      return _origFetch.apply(this, arguments);
    };
  }

  // Wrap Image.src — guarded against double-patching (preview reload safety)
  if (!window.__plbx_image_patched) {
    window.__plbx_image_patched = true;
    var _imgDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (_imgDesc && _imgDesc.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        set: function(v) {
          _logMacroFire(v, 'image');
          if (isExternal(v)) report('external_request', { url: v, type: 'image' });
          _imgDesc.set.call(this, v);
        },
        get: _imgDesc.get,
        configurable: true
      });
    }
  }
`);

  // Phase 4: SDK mocks (network-specific)

  // Shared state and listener system for MRAID + dapi
  const isMolocoV2 = networkId === 'molocoV2';
  if (mraid) {
    parts.push(`
  // Shared SDK state
  var _sdkState = 'loading';
  // MolocoV2 spec: ad container delivers viewableChange(true) only after the
  // creative is actually visible. Start false so production semantics are
  // mirrored — manual "Trigger viewable" button drives the transition.
  var _viewable = ${isMolocoV2 ? 'false' : 'true'};
  var _volume = 100;
  var _listeners = {};

  function _fire(name, data) {
    var arr = _listeners[name] || [];
    for (var i = 0; i < arr.length; i++) { try { arr[i](data); } catch(e) { console.warn('[plbx] Listener error:', e); } }
  }

  function _addListener(name, cb) {
    if (typeof cb !== 'function') return;
    _listeners[name] = _listeners[name] || [];
    if (_listeners[name].indexOf(cb) === -1) {
      _listeners[name].push(cb);
      // Tell the validator UI when payload registers viewableChange — without
      // that listener mraid_viewable never fires in production.
      report('mraid_listener_added', { event: name });
    }
    if (name === 'ready' && _sdkState !== 'loading') { setTimeout(function() { try { cb(); } catch(e) {} }, 0); }
  }

  function _removeListener(name, cb) {
    if (!_listeners[name]) return;
    if (!cb) { _listeners[name] = []; return; }
    _listeners[name] = _listeners[name].filter(function(f) { return f !== cb; });
  }

  function _getSize() { return { width: window.innerWidth || 320, height: window.innerHeight || 480 }; }

  // MRAID mock (2.0 + 3.0). Manual-trigger helpers (_fire*) exposed so the
  // validator UI can drive lifecycle transitions from the parent window.
  window.mraid = window.mraid || {
    getVersion: function() { return '3.0'; },
    getState: function() { return _sdkState; },
    isViewable: function() { return _viewable; },
    getAudioVolumePercentage: function() { return _volume; },
    getAudioVolume: function() { return _volume; },
    getMaxSize: function() { return _getSize(); },
    getScreenSize: function() { return _getSize(); },
    getCurrentPosition: function() { var s = _getSize(); return { x: 0, y: 0, width: s.width, height: s.height }; },
    getDefaultPosition: function() { var s = _getSize(); return { x: 0, y: 0, width: s.width, height: s.height }; },
    getPlacementType: function() { return 'interstitial'; },
    supports: function() { return true; },
    addEventListener: _addListener,
    removeEventListener: _removeListener,
    open: function(url) { report('cta', { url: url, method: 'mraid.open' }); },
    close: function() {},
    useCustomClose: function() {},
    setOrientationProperties: function() {},
    expand: function() {},
    _fireViewableChange: function(v) {
      _viewable = !!v;
      _fire('viewableChange', _viewable);
      report('mraid_viewable_change', { viewable: _viewable });
    },
    _fireExposureChange: function(exposed) {
      _fire('exposureChange', exposed ? 100 : 0);
    },
    _setState: function(s) {
      _sdkState = String(s);
      _fire('stateChange', _sdkState);
    },
    // Drive MRAID audioVolumeChange in isolation (no force-pause of audio
    // engine). Lets the validator verify the GAME reacts to live mute on its
    // own via plbx.on_mute_change, not the preview forcing silence.
    _setAudioVolume: function(v) {
      _volume = Number(v);
      _fire('audioVolumeChange', _volume);
      report('audio_volume', { volume: _volume });
    }
  };

  // dapi mock (IronSource/Unity Ads) — shares listeners with mraid
  window.dapi = window.dapi || {
    isDemoDapi: true,
    isReady: function() { return _sdkState !== 'loading'; },
    getAudioVolume: function() { return _volume; },
    getScreenSize: function() { return _getSize(); },
    isViewable: function() { return _viewable; },
    addEventListener: _addListener,
    removeEventListener: _removeListener,
    openStoreUrl: function(url) { report('cta', { url: url, method: 'dapi.openStoreUrl' }); }
  };

  // AudioContext tracking — patch BEFORE game creates any contexts
  window.__plbx_audioContexts = [];
  var _OrigAC = window.AudioContext || window.webkitAudioContext;
  if (_OrigAC) {
    var _PatchedAC = function AudioContext() {
      var ctx = new _OrigAC();
      window.__plbx_audioContexts.push(ctx);
      return ctx;
    };
    _PatchedAC.prototype = _OrigAC.prototype;
    window.AudioContext = _PatchedAC;
    if (window.webkitAudioContext) window.webkitAudioContext = _PatchedAC;
  }

  // Audio mute control via postMessage (reliable cross-iframe transport)
  function _handleMute(muted) {
    try {
      _volume = muted ? 0 : 100;
      report('audio_volume', { volume: _volume });
      _fire('audioVolumeChange', _volume);

      // Force suspend/resume all tracked AudioContexts
      (window.__plbx_audioContexts || []).forEach(function(ctx) {
        try { muted ? ctx.suspend() : ctx.resume(); } catch(err) {}
      });

      // Mute all <audio> and <video> elements
      var mediaEls = document.querySelectorAll('audio, video');
      for (var i = 0; i < mediaEls.length; i++) { mediaEls[i].muted = muted; }

      // Try to find Cocos audio engine and mute it directly
      if (window.cc && window.cc.audioEngine) {
        try {
          if (muted) { window.cc.audioEngine.pauseAll(); }
          else { window.cc.audioEngine.resumeAll(); }
        } catch(err) {}
      }
    } catch(err) { console.warn('[plbx] Audio mute error:', err); }
  }

  // Listen for postMessage from parent (primary transport)
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'plbx:audio-control') {
      _handleMute(!!e.data.muted);
    }
  });

  // Also listen for CustomEvent (legacy/playable-hosting compat)
  window.addEventListener('playable-audio-mute', function(e) {
    _handleMute(!!(e.detail && e.detail.muted));
  });

  // Viewable control from parent
  window.addEventListener('playable-screen-lock', function(e) {
    try {
      var locked = !!(e.detail && e.detail.locked);
      _viewable = !locked;
      _fire('viewableChange', _viewable);
    } catch(err) {}
  });

  // Initialize SDK after small delay.
  // For molocoV2: only flip state to 'default' (so getState() != 'loading')
  // and fire 'ready'. Viewable stays false until manual trigger — production
  // mraid behavior where viewableChange(true) arrives separately.
  setTimeout(function() {
    _sdkState = 'default';
    _fire('ready');
    ${isMolocoV2 ? "// viewable stays false — wait for manual trigger" : "_fire('viewableChange', true);"}
    report('mraid_ready', {});
  }, ${isMolocoV2 ? 100 : 50});
`);
  }

  // AppLovin Axon Events tracking
  if (networkId === 'applovin') {
    parts.push(`
  // ALPlayableAnalytics mock — intercept Axon Events
  window.ALPlayableAnalytics = window.ALPlayableAnalytics || {
    trackEvent: function(name) {
      report('axon_event', { name: name });
    }
  };
`);
  }

  if (networkId === 'mintegral') {
    parts.push(`
  // Mintegral mock: CTA via window.install()
  window.install = function() { report('cta', { method: 'install' }); };

`);
  }

  if (networkId === 'google') {
    parts.push(`
  // Google Ads mock
  window.ExitApi = { exit: function() { report('cta', { method: 'exitapi' }); } };
`);
  }

  if (networkId === 'facebook' || networkId === 'moloco') {
    parts.push(`
  // Facebook/Moloco mock — both use FbPlayableAd API
  window.FbPlayableAd = { onCTAClick: function() { report('cta', { method: 'fbplayable' }); } };
`);
  }

  if (networkId === 'molocoV2') {
    parts.push(`
  // ---- MolocoV2 validator extensions ----
  //
  // Manual-trigger postMessage protocol — the validator UI dispatches these to
  // drive lifecycle from outside the iframe. Distinct namespace from existing
  // plbx:audio-control etc. messages so we never cross signals.
  window.addEventListener('message', function(e) {
    var d = e && e.data;
    if (!d || typeof d !== 'object' || d.type !== 'plbx:molocov2') return;
    var action = d.action;
    try {
      switch (action) {
        case 'viewable':
          if (window.mraid && window.mraid._fireViewableChange) {
            window.mraid._fireViewableChange(d.value !== false);
          }
          break;
        case 'pause':
          if (window.mraid && window.mraid._setState) window.mraid._setState('hidden');
          break;
        case 'resume':
          if (window.mraid && window.mraid._setState) window.mraid._setState('default');
          if (window.mraid && window.mraid._fireViewableChange) window.mraid._fireViewableChange(true);
          break;
        case 'game-end':
          if (window.plbx_html && typeof window.plbx_html.game_end === 'function') {
            window.plbx_html.game_end();
          }
          break;
        case 'simulate-taps':
          var n = parseInt(d.count, 10);
          if (!isFinite(n) || n < 1) n = 1;
          for (var i = 0; i < n; i++) {
            if (window.plbx_html && typeof window.plbx_html.tap === 'function') {
              window.plbx_html.tap();
            }
          }
          break;
        case 'cta':
          if (window.plbx_html && typeof window.plbx_html.download === 'function') {
            window.plbx_html.download();
          }
          break;
        case 'mute':
          if (window.mraid && window.mraid._setAudioVolume) window.mraid._setAudioVolume(0);
          break;
        case 'unmute':
          if (window.mraid && window.mraid._setAudioVolume) window.mraid._setAudioVolume(100);
          break;
        default:
          break;
      }
    } catch(err) {
      report('error', { message: 'molocov2 trigger ' + action + ': ' + (err && err.message) });
    }
  });

  // Snapshot start_muted contract on load — UI surfaces the static
  // is_muted() value alongside the macro to verify the adapter reads it.
  setTimeout(function() {
    try {
      var raw = (window.MOLOCO_MACROS && window.MOLOCO_MACROS.start_muted) || '';
      var expected = (raw === '1' || raw === 'true');
      var actual = (window.plbx_html && typeof window.plbx_html.is_muted === 'function')
        ? !!window.plbx_html.is_muted()
        : null;
      report('molocov2_start_muted', { macro: raw, expected: expected, actual: actual });
    } catch(e) {}
  }, 200);

  // Track final_url usage in CTA path. mraid.open() intercept already reports
  // 'cta' — augment with whether the URL matches MOLOCO_MACROS.final_url.
  if (window.mraid && !window.mraid.__plbx_open_wrapped) {
    window.mraid.__plbx_open_wrapped = true;
    var _origOpen = window.mraid.open.bind(window.mraid);
    window.mraid.open = function(url) {
      var finalRaw = (window.MOLOCO_MACROS && window.MOLOCO_MACROS.final_url) || '';
      var finalDecoded = finalRaw;
      try { finalDecoded = decodeURIComponent(finalRaw); } catch(e) {}
      var match = !!url && (url === finalRaw || url === finalDecoded);
      report('molocov2_cta', { url: url, match: match });
      return _origOpen(url);
    };
  }
`);
  }

  if (networkId === 'tiktok' || networkId === 'pangle') {
    parts.push(`
  // TikTok/Pangle playable SDK mock
  window.playableSDK = window.playableSDK || {
    openAppStore: function() { report('cta', { method: 'playable_sdk' }); },
    reportGameReady: function() { report('game_ready', { method: 'playableSDK.reportGameReady' }); },
    reportGameClose: function() { report('game_end', { method: 'playableSDK.reportGameClose' }); }
  };
  // Alias
  window.openAppStore = function() { report('cta', { method: 'openAppStore' }); };
`);
  }

  if (networkId === 'bigo') {
    parts.push(`
  // Bigo MRAID SDK mock
  window.BGY_MRAID = { open: function(url) { report('cta', { url: url, method: 'bgy_mraid' }); } };
`);
  }

  if (networkId === 'vungle') {
    parts.push(`
  // Vungle Adaptive Creative mock — CTA via parent.postMessage
  var _origPostMessage = window.parent.postMessage.bind(window.parent);
  window.parent.postMessage = function(msg, origin) {
    if (msg === 'download') { report('cta', { method: 'vungle_download' }); }
    if (msg === 'complete') { report('game_end', { method: 'vungle_complete' }); }
    return _origPostMessage(msg, origin);
  };
`);
  }

  if (networkId === 'mytarget') {
    parts.push(`
  // myTarget (VK Ads) mock
  window.MTRG = { onCTAClick: function() { report('cta', { method: 'mtrg' }); } };
`);
  }

  if (networkId === 'yandex') {
    parts.push(`
  // Yandex mock
  window.yandexHTML5BannerApi = { getClickURLNum: function(n) { report('cta', { method: 'yandex', num: n }); } };
`);
  }

  // Audio control for non-MRAID networks (MRAID networks handle this in the SDK block above)
  if (!mraid) {
    parts.push(`
  // AudioContext tracking
  window.__plbx_audioContexts = [];
  var _OrigAC = window.AudioContext || window.webkitAudioContext;
  if (_OrigAC) {
    var _PatchedAC = function AudioContext() {
      var ctx = new _OrigAC();
      window.__plbx_audioContexts.push(ctx);
      return ctx;
    };
    _PatchedAC.prototype = _OrigAC.prototype;
    window.AudioContext = _PatchedAC;
    if (window.webkitAudioContext) window.webkitAudioContext = _PatchedAC;
  }

  // Audio mute via postMessage
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'plbx:audio-control') {
      var muted = !!e.data.muted;
      try {
        (window.__plbx_audioContexts || []).forEach(function(ctx) {
          try { muted ? ctx.suspend() : ctx.resume(); } catch(err) {}
        });
        var mediaEls = document.querySelectorAll('audio, video');
        for (var i = 0; i < mediaEls.length; i++) { mediaEls[i].muted = muted; }
        if (window.cc && window.cc.audioEngine) {
          try { muted ? window.cc.audioEngine.pauseAll() : window.cc.audioEngine.resumeAll(); } catch(err) {}
        }
      } catch(err) { console.warn('[plbx] Audio mute error:', err); }
    }
  });
`);
  }

  // Generic CTA fallback: wrap window.open
  parts.push(`
  // Generic CTA: wrap window.open
  var _origOpen = window.open;
  window.open = function(url, target) {
    report('cta', { url: url, method: 'window.open' });
    // Don't actually navigate in preview
    return null;
  };
`);

  // Phase 5: Lifecycle tracking
  parts.push(`
  // Lifecycle tracking
  window.gameReady = function() {
    report('game_ready', {});
    // Simulate SDK behavior: call gameStart() after gameReady, like real validators do
    setTimeout(function() {
      if (typeof window.gameStart === 'function') {
        try { window.gameStart(); } catch(e) {}
      }
    }, 100);
  };
  window.gameStart = function() { report('game_start', {}); };
  window.gameClose = function() { report('game_close', {}); };
  window.gameEnd = function() { report('game_end', {}); };

  // Signal load complete
  report('preview_loaded', { networkId: '${networkId}' });
`);

  parts.push(`
})();
`);

  return parts.join('');
}
