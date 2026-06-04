(function() {
  // ========== DEVICE CONFIGURATION ==========
  // Matches playable-hosting device-config.ts
  var DEVICES = {
    'iphone-16-pro': {
      width: 402, height: 874, type: 'phone',
      notch: { type: 'dynamic-island', width: 120, height: 32, radius: 20 },
      safeArea: { top: 59, bottom: 34, left: 0, right: 0 }
    },
    'iphone-16': {
      width: 393, height: 852, type: 'phone',
      notch: { type: 'dynamic-island', width: 120, height: 32, radius: 20 },
      safeArea: { top: 59, bottom: 34, left: 0, right: 0 }
    },
    'iphone-se': {
      width: 375, height: 667, type: 'phone',
      notch: null,
      safeArea: { top: 20, bottom: 0, left: 0, right: 0 }
    },
    'pixel-7-pro': {
      width: 412, height: 892, type: 'phone',
      notch: { type: 'punch-hole', width: 20, height: 20, radius: 10 },
      safeArea: { top: 30, bottom: 0, left: 0, right: 0 }
    },
    'galaxy-s24': {
      width: 384, height: 824, type: 'phone',
      notch: { type: 'punch-hole', width: 18, height: 18, radius: 9 },
      safeArea: { top: 28, bottom: 0, left: 0, right: 0 }
    },
    'ipad-air': {
      width: 820, height: 1180, type: 'tablet',
      notch: null,
      safeArea: { top: 24, bottom: 20, left: 0, right: 0 }
    },
    'ipad-mini': {
      width: 768, height: 1024, type: 'tablet',
      notch: null,
      safeArea: { top: 24, bottom: 0, left: 0, right: 0 }
    },
    'galaxy-tab-s9': {
      width: 800, height: 1280, type: 'tablet',
      notch: null,
      safeArea: { top: 24, bottom: 0, left: 0, right: 0 }
    }
  };

  var DEVICE_GROUPS = [
    {
      label: 'Phones',
      devices: [
        { id: 'iphone-16-pro', name: 'iPhone 16 Pro' },
        { id: 'iphone-16', name: 'iPhone 16' },
        { id: 'iphone-se', name: 'iPhone SE' },
        { id: 'pixel-7-pro', name: 'Google Pixel 7 Pro' },
        { id: 'galaxy-s24', name: 'Samsung Galaxy S24' }
      ]
    },
    {
      label: 'Tablets',
      devices: [
        { id: 'ipad-air', name: 'iPad Air' },
        { id: 'ipad-mini', name: 'iPad Mini' },
        { id: 'galaxy-tab-s9', name: 'Galaxy Tab S9' }
      ]
    }
  ];

  var DEFAULT_DEVICE = 'iphone-16-pro';

  // ========== STATE ==========
  var networks = [];
  var currentNetwork = null;
  var checks = {};
  var timeouts = {};
  var currentDevice = DEFAULT_DEVICE;
  var isLandscape = false;
  var audioMuted = false;
  var axonFired = {};      // { eventName: count }
  var axonSequence = [];   // ordered fire log (with repeats) for spec validation
  var axonTimestamps = []; // ms timestamps aligned to axonSequence (CHALLENGE_* spacing)
  var currentValidatorUrl = null;
  // MolocoV2 state
  var isMolocoV2 = false;
  var macroFires = {};           // { macroKey: { count, lastTs, lastUrl } }
  var molocoV2MacroDefs = [];    // [{ id: 'macro_X', label, key }] extracted from server checks
  var viewableListenerSeen = false;

  // ========== DOM REFERENCES ==========
  var phoneFrame = document.getElementById('phone-frame');
  var previewArea = document.getElementById('preview-area');
  var orientationToggle = document.getElementById('orientation-toggle');
  var orientationLabel = document.getElementById('orientation-label');
  var deviceDropdown = document.getElementById('device-dropdown');
  var deviceTrigger = document.getElementById('device-dropdown-trigger');
  var deviceDropdownLabel = document.getElementById('device-dropdown-label');
  var deviceDropdownMenu = document.getElementById('device-dropdown-menu');
  var audioToggleBtn = document.getElementById('audio-toggle');
  var reloadBtn = document.getElementById('reload-btn');

  // ========== CHECKLIST DEFINITIONS ==========
  // Dynamic: loaded per-network from /api/networks response
  var CHECK_DEFS = [];

  // Fallback definitions if network doesn't provide checks
  var DEFAULT_CHECK_DEFS = [
    { id: 'file_size', label: 'File size' },
    { id: 'game_loads', label: 'Game loads' },
    { id: 'cta', label: 'CTA Call' },
    { id: 'no_external', label: 'No external requests' },
    { id: 'no_errors', label: 'No code exceptions' },
  ];

  // ========== CONSOLE LOGGING ==========
  function log(msg, cls) {
    var c = document.getElementById('console');
    var d = document.createElement('div');
    d.className = 'entry ' + (cls || '');
    d.textContent = new Date().toISOString().substr(11, 12) + ' ' + msg;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
  }

  // ========== CHECKLIST ==========
  function resetChecks() {
    checks = {};
    CHECK_DEFS.forEach(function(def) {
      checks[def.id] = { status: 'pending', detail: '' };
    });
    Object.keys(timeouts).forEach(function(k) { clearTimeout(timeouts[k]); });
    timeouts = {};
    renderChecklist();
  }

  function setCheck(id, status, detail) {
    if (checks[id]) {
      checks[id].status = status;
      if (detail) checks[id].detail = detail;
      renderChecklist();
    }
  }

  function renderChecklist() {
    var el = document.getElementById('checklist');
    while (el.firstChild) el.removeChild(el.firstChild);

    CHECK_DEFS.forEach(function(def) {
      var c = checks[def.id] || { status: 'pending', detail: '' };
      var icons = { pending: '\u23F3', pass: '\u2705', fail: '\u274C', warn: '\u26A0\uFE0F' };

      var div = document.createElement('div');
      var stateClass = c.status === 'fail' ? ' fail' : c.status === 'warn' ? ' warn' : '';
      div.className = 'check' + stateClass;

      var iconSpan = document.createElement('span');
      iconSpan.className = 'icon';
      iconSpan.textContent = icons[c.status];
      div.appendChild(iconSpan);

      var infoDiv = document.createElement('div');
      infoDiv.className = 'check-info';
      var labelDiv = document.createElement('div');
      labelDiv.textContent = def.label;
      infoDiv.appendChild(labelDiv);

      if (c.detail) {
        var detailDiv = document.createElement('div');
        detailDiv.className = 'detail';
        detailDiv.textContent = c.detail;
        infoDiv.appendChild(detailDiv);
      }

      // Show hint for failed checks
      if (c.status === 'fail' && def.hint) {
        var hintDiv = document.createElement('div');
        hintDiv.className = 'check-hint';
        hintDiv.textContent = def.hint;
        infoDiv.appendChild(hintDiv);
      }

      div.appendChild(infoDiv);
      el.appendChild(div);
    });

    // Validator link
    if (currentValidatorUrl) {
      var linkDiv = document.createElement('div');
      linkDiv.className = 'validator-link';
      var a = document.createElement('a');
      a.href = currentValidatorUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Check in official validator \u2197';
      linkDiv.appendChild(a);
      el.appendChild(linkDiv);
    }
  }

  // ========== AXON EVENTS ==========
  var isAxonNetwork = false;

  // Spec conformance checklist \u2014 computed client-side from the fired sequence so
  // it ALWAYS renders (no async dependency). Mirrors validateAxonSequence() in
  // src/core/packager/axon-events.ts (the unit-tested authority) \u2014 KEEP IN SYNC.
  var AXON_SPEC_EVENTS = [
    'LOADING', 'LOADED', 'DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_FAILED', 'CHALLENGE_RETRY',
    'CHALLENGE_PASS_25', 'CHALLENGE_PASS_50', 'CHALLENGE_PASS_75', 'CHALLENGE_SOLVED', 'CTA_CLICKED', 'ENDCARD_SHOWN',
  ];
  var AXON_DEDUP_ONCE = ['LOADING', 'LOADED', 'DISPLAYED', 'ENDCARD_SHOWN', 'CHALLENGE_STARTED', 'CTA_CLICKED'];
  var AXON_CHALLENGE_COMPLETION = ['CHALLENGE_SOLVED', 'CHALLENGE_FAILED', 'CHALLENGE_RETRY'];
  var AXON_ORDER_PAIRS = [
    ['LOADING', 'LOADED'], ['LOADING', 'DISPLAYED'], ['LOADED', 'DISPLAYED'],
    ['DISPLAYED', 'CHALLENGE_STARTED'],
    ['CHALLENGE_STARTED', 'CHALLENGE_PASS_25'], ['CHALLENGE_STARTED', 'CHALLENGE_PASS_50'],
    ['CHALLENGE_STARTED', 'CHALLENGE_PASS_75'], ['CHALLENGE_STARTED', 'CHALLENGE_SOLVED'],
    ['CHALLENGE_STARTED', 'CHALLENGE_FAILED'], ['CHALLENGE_STARTED', 'CHALLENGE_RETRY'],
    ['CHALLENGE_PASS_25', 'CHALLENGE_PASS_50'], ['CHALLENGE_PASS_50', 'CHALLENGE_PASS_75'],
    ['DISPLAYED', 'ENDCARD_SHOWN'], ['DISPLAYED', 'CTA_CLICKED'], ['CHALLENGE_SOLVED', 'ENDCARD_SHOWN'],
  ];
  var AXON_MIN_CHALLENGE_MS = 50;
  function isChallengeEvt(n) { return n.indexOf('CHALLENGE_') === 0; }

  var AXON_HINTS = {
    all_conformant: 'All Axon events fired with valid names, in lifecycle order, deduped, and correctly spaced \u2014 per the AppLovin Axon spec.',
    displayed: 'Fire ALPlayableAnalytics.trackEvent(\'DISPLAYED\') once the creative is shown and ready for interaction. It is the only mandatory Axon event.',
    no_unknown: 'Use only the 12 predefined Axon event names \u2014 AppLovin does not track custom names. Rename or remove non-spec events.',
    loaded: 'LOADING and LOADED are a pair \u2014 fire LOADING when in-playable loading starts and LOADED when it finishes, or fire neither.',
    challenge_completion: 'After CHALLENGE_STARTED, fire one of CHALLENGE_SOLVED / CHALLENGE_FAILED / CHALLENGE_RETRY when the challenge resolves.',
    order: 'Fire events in lifecycle order: LOADING \u2192 LOADED \u2192 DISPLAYED \u2192 CHALLENGE_* \u2192 CHALLENGE_SOLVED \u2192 ENDCARD_SHOWN. CTA_CLICKED may fire any time after DISPLAYED.',
    dedup: 'Fire-once events (LOADING, LOADED, DISPLAYED, ENDCARD_SHOWN, CHALLENGE_STARTED, CTA_CLICKED) must each fire exactly once per session.',
    challenge_spacing: 'Leave \u226550ms between CHALLENGE_* events \u2014 AppLovin forbids simultaneous dispatch; each must mark a distinct gameplay moment.',
  };

  function computeAxonChecks() {
    // Before anything fires: a pending checklist so the user sees what's checked.
    if (axonSequence.length === 0) {
      return [
        { id: 'all_conformant', label: 'Waiting for events\u2026', status: 'pending', hint: AXON_HINTS.all_conformant },
        { id: 'displayed', label: 'DISPLAYED fired (required)', status: 'pending', hint: AXON_HINTS.displayed },
        { id: 'no_unknown', label: 'Valid spec event names', status: 'pending', hint: AXON_HINTS.no_unknown },
        { id: 'order', label: 'Lifecycle call order', status: 'pending', hint: AXON_HINTS.order },
        { id: 'dedup', label: 'No duplicate fire-once events', status: 'pending', hint: AXON_HINTS.dedup },
        { id: 'challenge_spacing', label: 'CHALLENGE_* \u226550ms apart', status: 'pending', hint: AXON_HINTS.challenge_spacing },
      ];
    }

    var checks = [];
    var has = {};
    axonSequence.forEach(function(e) { has[e] = true; });
    var specSet = {};
    AXON_SPEC_EVENTS.forEach(function(e) { specSet[e] = true; });

    checks.push({ id: 'displayed', label: 'DISPLAYED fired (required)', ok: !!has['DISPLAYED'], level: 'warn',
      detail: 'Not fired yet.', hint: AXON_HINTS.displayed });

    var unknown = Object.keys(has).filter(function(e) { return !specSet[e]; });
    checks.push({ id: 'no_unknown', label: 'Valid spec event names', ok: unknown.length === 0, level: 'error',
      detail: 'AppLovin rejects custom event names: ' + unknown.join(', '), hint: AXON_HINTS.no_unknown });

    if (has['LOADING'] || has['LOADED']) {
      var loadedFiredSide = has['LOADING'] ? 'LOADING' : 'LOADED';
      var loadedMissingSide = has['LOADING'] ? 'LOADED' : 'LOADING';
      checks.push({ id: 'loaded', label: 'LOADING and LOADED both fired', ok: !!has['LOADING'] && !!has['LOADED'], level: 'warn',
        detail: 'Only ' + loadedFiredSide + ' fired \u2014 ' + loadedMissingSide + ' missing.', hint: AXON_HINTS.loaded });
    }
    if (has['CHALLENGE_STARTED']) {
      var done = AXON_CHALLENGE_COMPLETION.some(function(e) { return has[e]; });
      checks.push({ id: 'challenge_completion', label: 'Challenge completion fired', ok: done, level: 'warn',
        detail: 'CHALLENGE_STARTED fired but no completion event.', hint: AXON_HINTS.challenge_completion });
    }

    var firstIdx = {};
    axonSequence.forEach(function(e, i) { if (firstIdx[e] === undefined) firstIdx[e] = i; });
    var ov = [];
    AXON_ORDER_PAIRS.forEach(function(p) {
      if (firstIdx[p[0]] !== undefined && firstIdx[p[1]] !== undefined && firstIdx[p[0]] > firstIdx[p[1]]) {
        ov.push(p[0] + ' should precede ' + p[1]);
      }
    });
    checks.push({ id: 'order', label: 'Lifecycle call order', ok: ov.length === 0, level: 'warn',
      detail: 'out of order \u2014 ' + ov.join(', '), hint: AXON_HINTS.order });

    var counts = {};
    axonSequence.forEach(function(e) { counts[e] = (counts[e] || 0) + 1; });
    var dups = AXON_DEDUP_ONCE.filter(function(e) { return counts[e] > 1; });
    checks.push({ id: 'dedup', label: 'Fire-once events fired once', ok: dups.length === 0, level: 'warn',
      detail: 'fired more than once \u2014 ' + dups.map(function(e) { return e + '\u00d7' + counts[e]; }).join(', '), hint: AXON_HINTS.dedup });

    var chal = [];
    axonSequence.forEach(function(e, i) { if (isChallengeEvt(e)) chal.push({ e: e, ts: axonTimestamps[i] }); });
    if (chal.length >= 2) {
      var close = [];
      for (var i = 1; i < chal.length; i++) {
        var dt = chal[i].ts - chal[i - 1].ts;
        if (dt < AXON_MIN_CHALLENGE_MS) close.push(chal[i - 1].e + '\u2192' + chal[i].e + ' ' + Math.round(dt) + 'ms');
      }
      checks.push({ id: 'challenge_spacing', label: 'CHALLENGE_* \u226550ms apart', ok: close.length === 0, level: 'warn',
        detail: 'fired too close (no simultaneous CHALLENGE_*) \u2014 ' + close.join(', '), hint: AXON_HINTS.challenge_spacing });
    }

    var failures = checks.filter(function(c) { return !c.ok; });
    checks.unshift({ id: 'all_conformant',
      label: failures.length === 0 ? 'All events conform to spec' : (failures.length + ' spec issue(s)'),
      ok: failures.length === 0,
      level: failures.some(function(c) { return c.level === 'error'; }) ? 'error' : 'warn',
      detail: failures.map(function(c) { return c.label; }).join('; '),
      hint: AXON_HINTS.all_conformant });
    return checks;
  }

  function axonCheckStatus(check) {
    if (check.status) return check.status; // explicit (pending)
    if (check.ok) return 'pass';
    return check.level === 'error' ? 'fail' : 'warn';
  }

  function renderAxonVerdicts() {
    var container = document.getElementById('axon-verdicts');
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);

    computeAxonChecks().forEach(function(check) {
      var status = axonCheckStatus(check);
      var div = document.createElement('div');
      div.className = 'axon-verdict ' + status + (check.id === 'all_conformant' ? ' aggregate' : '');
      if (check.hint) div.title = check.hint;
      var icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = status === 'pass' ? '\u2713' : status === 'fail' ? '\u2717' : status === 'pending' ? '\u00b7' : '!';
      div.appendChild(icon);
      var text = document.createElement('span');
      text.className = 'text';
      text.textContent = check.label;
      if (status !== 'pass' && status !== 'pending' && check.detail) {
        var d = document.createElement('span');
        d.className = 'detail';
        d.textContent = check.detail;
        text.appendChild(d);
      }
      div.appendChild(text);
      container.appendChild(div);
    });
  }

  function renderAxonEvents() {
    var sidebar = document.getElementById('axon-sidebar');
    var container = document.getElementById('axon-events');
    var emptyMsg = document.getElementById('axon-empty');
    if (!container) return;

    // Left sidebar only shown for AppLovin (Axon is AppLovin-specific).
    if (!isAxonNetwork) {
      if (sidebar) sidebar.style.display = 'none';
      return;
    }

    if (sidebar) sidebar.style.display = '';
    renderAxonVerdicts();
    while (container.firstChild) container.removeChild(container.firstChild);

    // List the events that actually fired (spec order, non-spec names last).
    var fired = Object.keys(axonFired).filter(function(k) { return axonFired[k] > 0; });
    if (fired.length === 0) {
      emptyMsg.style.display = '';
      return;
    }
    emptyMsg.style.display = 'none';

    var ordered = AXON_SPEC_EVENTS.filter(function(e) { return axonFired[e] > 0; });
    fired.forEach(function(e) { if (ordered.indexOf(e) === -1) ordered.push(e); });

    ordered.forEach(function(name) {
      var count = axonFired[name] || 0;
      var isSpec = AXON_SPEC_EVENTS.indexOf(name) !== -1;
      var div = document.createElement('div');
      div.className = isSpec ? 'axon-event fired' : 'axon-event fired invalid';
      if (!isSpec) {
        div.title = 'Not a valid Axon spec event — AppLovin rejects custom event names';
      }

      var icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = isSpec ? '\u26A1' : '\u26A0';
      div.appendChild(icon);

      var nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      nameSpan.textContent = name;
      div.appendChild(nameSpan);

      var countSpan = document.createElement('span');
      countSpan.className = 'count';
      countSpan.textContent = '\u00D7' + count;
      div.appendChild(countSpan);

      container.appendChild(div);
    });
  }

  // ========== MOLOCOV2 MACRO TRACKING ==========
  function resetMolocoV2State() {
    macroFires = {};
    viewableListenerSeen = false;
    renderMolocoV2Section();
  }

  function renderMolocoV2Section() {
    var dock = document.getElementById('mv2-dock');
    if (dock) dock.style.display = isMolocoV2 ? '' : 'none';
    var section = document.getElementById('molocov2-section');
    if (!section) return;
    if (!isMolocoV2) { section.style.display = 'none'; return; }
    section.style.display = '';

    var container = document.getElementById('molocov2-macros');
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);

    molocoV2MacroDefs.forEach(function(def) {
      var entry = macroFires[def.key];
      var count = entry ? entry.count : 0;
      var status = count === 0 ? 'pending' : count === 1 ? 'fired' : 'warn';
      var div = document.createElement('div');
      div.className = 'mv2-macro ' + status;

      var icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = count === 0 ? '⏳' : count === 1 ? '✅' : '⚠';
      div.appendChild(icon);

      var info = document.createElement('div');
      info.className = 'mv2-macro-info';
      var name = document.createElement('div');
      name.className = 'mv2-macro-name';
      name.textContent = def.key;
      info.appendChild(name);
      if (entry) {
        var meta = document.createElement('div');
        meta.className = 'mv2-macro-meta';
        meta.textContent = 'fired ' + count + '× @ ' + Math.round(entry.lastTs) + 'ms';
        info.appendChild(meta);
      }
      div.appendChild(info);
      container.appendChild(div);
    });
  }

  function recordMacroFire(macroKey, url, ts) {
    if (!macroFires[macroKey]) {
      macroFires[macroKey] = { count: 0, lastTs: 0, lastUrl: '' };
    }
    macroFires[macroKey].count++;
    macroFires[macroKey].lastTs = typeof ts === 'number' ? ts : 0;
    macroFires[macroKey].lastUrl = url || '';
    var checkId = 'macro_' + macroKey;
    if (checks[checkId]) {
      var c = macroFires[macroKey].count;
      var detail = 'fired ' + c + '×';
      setCheck(checkId, c === 1 ? 'pass' : 'warn', detail);
    }
    renderMolocoV2Section();
  }

  // ========== NETWORK LOADING ==========
  function loadNetwork(id) {
    currentNetwork = id;

    // Set network-specific check definitions
    var net = networks.find(function(n) { return n.id === id; });
    if (net && net.checks && net.checks.length > 0) {
      CHECK_DEFS = net.checks;
    } else {
      CHECK_DEFS = DEFAULT_CHECK_DEFS;
    }
    currentValidatorUrl = (net && net.validatorUrl) || null;

    // MolocoV2 mode toggle — drives macro section + manual-trigger buttons
    isMolocoV2 = (id === 'molocoV2');
    molocoV2MacroDefs = CHECK_DEFS
      .filter(function(d) { return d.id.indexOf('macro_') === 0; })
      .map(function(d) { return { id: d.id, label: d.label, key: d.id.replace('macro_', '') }; });
    resetMolocoV2State();

    resetChecks();
    var consoleEl = document.getElementById('console');
    while (consoleEl.firstChild) consoleEl.removeChild(consoleEl.firstChild);
    log('Loading ' + id + '...');

    document.querySelectorAll('.tab').forEach(function(t) {
      t.classList.toggle('active', t.dataset.id === id);
    });

    if (net) {
      var sizeMB = (net.size / 1048576).toFixed(2);
      var maxMB = (net.maxSize / 1048576).toFixed(1);
      if (net.size <= net.maxSize) {
        setCheck('file_size', 'pass', sizeMB + ' / ' + maxMB + ' MB');
      } else {
        setCheck('file_size', 'fail', sizeMB + ' / ' + maxMB + ' MB — OVER LIMIT');
      }
    }

    setCheck('no_external', 'pass', 'No external requests detected');
    setCheck('no_errors', 'pass', 'No exceptions');

    // Store URL literals — static check against the built HTML (Unity Creative Pack
    // greps the raw markup). Set from server-side scan; checks only exist for
    // networks flagged requiresStoreUrl.
    if (net && net.requiresStoreUrl) {
      setCheck('google_play_url', net.hasGooglePlayUrl ? 'pass' : 'fail',
        net.hasGooglePlayUrl ? 'Found in build' : 'MISSING — set via set_google_play_url(...) in game code');
      setCheck('app_store_url', net.hasAppStoreUrl ? 'pass' : 'fail',
        net.hasAppStoreUrl ? 'Found in build' : 'MISSING — set via set_app_store_url(...) in game code');
    }

    // Regional/localization params in the store URL — should be absent for global
    // delivery (all networks). The check def exists only when the build has a store
    // URL; setCheck is a no-op otherwise.
    if (net && net.regional && net.regional.length) {
      setCheck('store_url_regional', 'warn', net.regional.join('; '));
    } else {
      setCheck('store_url_regional', 'pass', 'No regional params');
    }

    // Axon Events (AppLovin): runtime-fired events are checked client-side
    // against the spec (computeAxonChecks). Reset per network switch.
    axonFired = {};
    axonSequence = [];
    axonTimestamps = [];
    isAxonNetwork = (id === 'applovin');
    renderAxonEvents();

    var frame = document.getElementById('preview-frame');
    frame.src = '/preview/' + id;

    frame.onload = function() {
      setCheck('game_loads', 'pass');
      log('iframe loaded');
    };
    frame.onerror = function() {
      setCheck('game_loads', 'fail', 'iframe failed to load');
    };

    // Timeout only applies to auto-detected checks, NOT user-interaction checks
    var NO_TIMEOUT = { cta: true, game_end: true, game_close: true };
    timeouts.lifecycle = setTimeout(function() {
      CHECK_DEFS.forEach(function(def) {
        if (checks[def.id] && checks[def.id].status === 'pending' && !NO_TIMEOUT[def.id]) {
          setCheck(def.id, 'fail', 'Not detected within 30s');
        }
      });
    }, 30000);
  }

  // ========== CTA TOAST ==========
  var ctaToastTimer = null;
  function showCtaToast(method, bad) {
    var toast = document.getElementById('cta-toast');
    if (!toast) return;
    toast.textContent = 'CTA Clicked' + (method ? ' — ' + method : '');
    // Red when the click won't be tracked by the network (e.g. bare window.open).
    toast.className = 'cta-toast visible' + (bad ? ' bad' : '');
    clearTimeout(ctaToastTimer);
    ctaToastTimer = setTimeout(function() {
      toast.className = 'cta-toast fade-out' + (bad ? ' bad' : '');
      setTimeout(function() { toast.className = 'cta-toast'; }, 400);
    }, 1500);
  }

  // ========== POST MESSAGE LISTENER ==========
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'plbx:preview') return;
    var evt = e.data.event;
    var data = e.data.data || {};

    // macro_fire emits its own specialized log line below — skip the generic
    // [preview] entry so the console doesn't show two lines per fire.
    if (evt !== 'macro_fire') {
      var logMsg = '[preview] ' + evt;
      if (data.url) logMsg += ' url=' + data.url;
      if (data.message) logMsg += ' ' + data.message;
      log(logMsg, evt === 'error' ? 'error' : evt === 'cta' ? 'cta' : '');
    }

    switch (evt) {
      case 'mraid_ready': setCheck('mraid_ready', 'pass'); break;
      case 'game_ready': setCheck('game_ready', 'pass'); break;
      case 'game_start': setCheck('game_start', 'pass'); break;
      case 'cta':
        // Only the network's real CTA SDK method counts. A bare window.open()
        // (or any non-matching method) is NOT tracked by the real validator —
        // show it as a warning, not a green pass, so the preview tells the truth.
        if (data.correct === false) {
          setCheck('cta', 'warn', (data.method || 'called') + " won't track — " + (data.expected || '?') + ' expected');
          showCtaToast((data.method || 'CTA') + ' (won\'t track)', true);
        } else {
          setCheck('cta', 'pass', data.method || 'called');
          showCtaToast(data.method);
        }
        break;
      case 'game_close': setCheck('game_close', 'pass'); break;
      case 'game_end': setCheck('game_end', 'pass'); break;
      case 'error': setCheck('no_errors', 'fail', data.message || 'Exception detected'); break;
      case 'external_request': setCheck('no_external', 'fail', data.url || 'External request detected'); break;
      case 'axon_event':
        if (data.name) {
          axonFired[data.name] = (axonFired[data.name] || 0) + 1;
          axonSequence.push(data.name);
          axonTimestamps.push(typeof data.ts === 'number' ? data.ts : Date.now());
          log('Axon: ' + data.name + ' (×' + axonFired[data.name] + ')', 'cta');
          renderAxonEvents();
        }
        break;
      case 'macro_fire':
        if (data.macroKey) {
          log('Macro: ' + data.macroKey + ' [' + (data.channel || 'image') + ']', 'cta');
          recordMacroFire(data.macroKey, data.url, data.ts);
        }
        break;
      case 'mraid_listener_added':
        if (data.event === 'viewableChange') {
          viewableListenerSeen = true;
          setCheck('viewable_listener', 'pass');
        }
        break;
      case 'mraid_viewable_change':
        log('mraid viewable=' + data.viewable);
        break;
      case 'molocov2_start_muted':
        // expected derived from MOLOCO_MACROS.start_muted; actual from plbx_html.is_muted()
        if (checks['macro_start_muted']) {
          var match = data.expected === data.actual;
          setCheck('macro_start_muted', match ? 'pass' : 'warn',
            'macro=' + (data.macro || '∅') + ' is_muted=' + data.actual);
        }
        break;
      case 'molocov2_cta':
        // CTA via mraid.open — verify URL matches MOLOCO_MACROS.final_url
        if (checks['final_url_used']) {
          setCheck('final_url_used', data.match ? 'pass' : 'fail',
            data.match ? 'matches final_url' : 'fallback URL: ' + (data.url || ''));
        }
        break;
      case 'preview_loaded': log('preview-util.js initialized for ' + data.networkId); break;
    }
  });

  // ========== MOLOCOV2 MANUAL TRIGGERS ==========
  function sendMolocoV2Trigger(action, extras) {
    var frame = document.getElementById('preview-frame');
    if (!frame || !frame.contentWindow) return;
    var msg = Object.assign({ type: 'plbx:molocov2', action: action }, extras || {});
    frame.contentWindow.postMessage(msg, '*');
    log('→ trigger: ' + action + (extras && extras.count ? ' (×' + extras.count + ')' : ''), 'cta');
  }

  document.querySelectorAll('[data-mv2-action]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var action = btn.getAttribute('data-mv2-action');
      var extras = {};
      var rawValue = btn.getAttribute('data-mv2-value');
      if (rawValue !== null) extras.value = rawValue === 'true';
      if (action === 'simulate-taps') {
        var inp = document.getElementById('mv2-tap-count');
        var n = parseInt(inp && inp.value, 10);
        if (!isFinite(n) || n < 1) n = 1;
        extras.count = n;
      }
      sendMolocoV2Trigger(action, extras);
    });
  });

  var mv2ResetBtn = document.getElementById('mv2-reset');
  if (mv2ResetBtn) {
    mv2ResetBtn.addEventListener('click', function() {
      if (!currentNetwork) return;
      log('Reset macro state — reloading preview');
      loadNetwork(currentNetwork);
    });
  }

  var mv2DockToggle = document.getElementById('mv2-dock-toggle');
  if (mv2DockToggle) {
    mv2DockToggle.addEventListener('click', function() {
      var dock = document.getElementById('mv2-dock');
      if (!dock) return;
      var collapsed = dock.classList.toggle('collapsed');
      mv2DockToggle.textContent = collapsed ? '+' : '–';
      mv2DockToggle.title = collapsed ? 'Expand' : 'Collapse';
    });
  }

  // ========== AUDIO CONTROL ==========
  function dispatchToIframe(eventName, detail) {
    var frame = document.getElementById('preview-frame');
    if (!frame) return;
    try {
      var win = frame.contentWindow;
      if (win) {
        win.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
      }
    } catch (e) {
      console.warn('[plbx] Failed to dispatch to iframe:', e);
    }
  }

  // Force-mute audio in iframe via Web Audio API + media elements
  function forceAudioMute(muted) {
    var frame = document.getElementById('preview-frame');
    if (!frame) return;
    try {
      var win = frame.contentWindow;
      if (!win) return;

      // Mute/unmute all <audio> and <video> elements
      var doc = frame.contentDocument || win.document;
      if (doc) {
        var mediaEls = doc.querySelectorAll('audio, video');
        for (var i = 0; i < mediaEls.length; i++) {
          mediaEls[i].muted = muted;
        }
      }

      // Suspend/resume all AudioContext instances
      // Cocos Creator stores AudioContext on cc.audioEngine or as global
      if (win.__plbx_audioContexts) {
        win.__plbx_audioContexts.forEach(function(ctx) {
          try { muted ? ctx.suspend() : ctx.resume(); } catch(e) {}
        });
      }

      // Patch AudioContext constructor to track new contexts
      if (!win.__plbx_audioPatched) {
        win.__plbx_audioPatched = true;
        win.__plbx_audioContexts = [];
        var OrigAC = win.AudioContext || win.webkitAudioContext;
        if (OrigAC) {
          var PatchedAC = function() {
            var ctx = new OrigAC();
            win.__plbx_audioContexts.push(ctx);
            // Apply current mute state
            if (audioMuted) { try { ctx.suspend(); } catch(e) {} }
            return ctx;
          };
          PatchedAC.prototype = OrigAC.prototype;
          win.AudioContext = PatchedAC;
          if (win.webkitAudioContext) win.webkitAudioContext = PatchedAC;
        }
      }

      // Also try to find existing AudioContext on globalThis
      ['_audioContext', 'audioContext', '__audioContext'].forEach(function(key) {
        var ctx = win[key];
        if (ctx && ctx.suspend && ctx.resume) {
          try { muted ? ctx.suspend() : ctx.resume(); } catch(e) {}
        }
      });
    } catch (e) {
      console.warn('[plbx] Force audio mute failed:', e);
    }
  }

  if (audioToggleBtn) {
    audioToggleBtn.addEventListener('click', function() {
      audioMuted = !audioMuted;
      // Primary: postMessage (reliable cross-iframe transport)
      var frame = document.getElementById('preview-frame');
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'plbx:audio-control', muted: audioMuted }, '*');
      }
      // Fallback: CustomEvent + direct AudioContext access
      dispatchToIframe('playable-audio-mute', { muted: audioMuted });
      forceAudioMute(audioMuted);
      audioToggleBtn.classList.toggle('muted', audioMuted);
      log(audioMuted ? 'Audio muted (volume=0)' : 'Audio unmuted (volume=100)');
    });
  }

  // ========== RELOAD BUTTON ==========
  if (reloadBtn) {
    reloadBtn.addEventListener('click', function() {
      if (currentNetwork) {
        loadNetwork(currentNetwork);
      }
    });
  }

  // ========== DEVICE MANAGER ==========

  // Build the dropdown menu using safe DOM methods (no innerHTML)
  function buildDeviceDropdown() {
    while (deviceDropdownMenu.firstChild) deviceDropdownMenu.removeChild(deviceDropdownMenu.firstChild);

    DEVICE_GROUPS.forEach(function(group) {
      var groupDiv = document.createElement('div');
      groupDiv.className = 'device-dropdown-group';

      var labelDiv = document.createElement('div');
      labelDiv.className = 'device-dropdown-label';
      labelDiv.textContent = group.label;
      groupDiv.appendChild(labelDiv);

      group.devices.forEach(function(dev) {
        var itemDiv = document.createElement('div');
        itemDiv.className = 'device-dropdown-item';
        if (dev.id === currentDevice) itemDiv.className += ' selected';
        itemDiv.setAttribute('data-value', dev.id);
        itemDiv.textContent = dev.name;

        itemDiv.addEventListener('click', function() {
          selectDevice(dev.id, dev.name);
        });

        groupDiv.appendChild(itemDiv);
      });

      deviceDropdownMenu.appendChild(groupDiv);
    });
  }

  function selectDevice(deviceId, label) {
    currentDevice = deviceId;
    deviceDropdownLabel.textContent = label;

    // Update selected state in dropdown items
    var items = deviceDropdownMenu.querySelectorAll('.device-dropdown-item');
    items.forEach(function(item) {
      item.classList.toggle('selected', item.getAttribute('data-value') === deviceId);
    });

    deviceDropdown.classList.remove('open');
    updateFrameDimensions(true);
    savePreferences();
  }

  // Toggle dropdown open/close
  if (deviceTrigger) {
    deviceTrigger.addEventListener('click', function(e) {
      e.stopPropagation();
      deviceDropdown.classList.toggle('open');
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', function(e) {
    if (deviceDropdown && !deviceDropdown.contains(e.target)) {
      deviceDropdown.classList.remove('open');
    }
  });

  // ========== SCALING & DIMENSIONS ==========
  function getDeviceDimensions(deviceId, landscape) {
    var device = DEVICES[deviceId] || DEVICES[DEFAULT_DEVICE];

    var deviceW = landscape ? device.height : device.width;
    var deviceH = landscape ? device.width : device.height;

    // Use the preview-area container dimensions for scaling
    var container = previewArea;
    var containerWidth = container.clientWidth;
    var containerHeight = container.clientHeight;

    var maxW = containerWidth - 72;
    var maxH = containerHeight - 120;

    var scaleW = maxW / deviceW;
    var scaleH = maxH / deviceH;
    var visualScale = Math.min(scaleW, scaleH, 1);

    return {
      width: deviceW,
      height: deviceH,
      type: device.type,
      notch: device.notch,
      scale: visualScale
    };
  }

  function updateFrameDimensions(animate) {
    var dims = getDeviceDimensions(currentDevice, isLandscape);

    if (!animate) phoneFrame.classList.add('no-transition');

    phoneFrame.style.width = dims.width + 'px';
    phoneFrame.style.height = dims.height + 'px';

    if (dims.scale < 1) {
      phoneFrame.style.transform = 'scale(' + dims.scale + ')';
      phoneFrame.style.transformOrigin = 'center center';
      // Compensate for scale with negative margins so layout doesn't leave gaps
      var widthDiff = dims.width * (1 - dims.scale);
      var heightDiff = dims.height * (1 - dims.scale);
      phoneFrame.style.margin = '-' + (heightDiff / 2) + 'px -' + (widthDiff / 2) + 'px';
    } else {
      phoneFrame.style.transform = 'none';
      phoneFrame.style.margin = '0';
    }

    // Toggle CSS classes
    phoneFrame.classList.toggle('landscape', isLandscape);
    orientationToggle.classList.toggle('landscape', isLandscape);
    phoneFrame.classList.toggle('tablet', dims.type === 'tablet');

    // Notch configuration
    if (dims.notch) {
      phoneFrame.classList.remove('no-notch');
      phoneFrame.style.setProperty('--notch-width', dims.notch.width + 'px');
      phoneFrame.style.setProperty('--notch-height', dims.notch.height + 'px');
      phoneFrame.style.setProperty('--notch-radius', dims.notch.radius + 'px');
    } else {
      phoneFrame.classList.add('no-notch');
    }

    if (!animate) {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          phoneFrame.classList.remove('no-transition');
        });
      });
    }
  }

  // ========== ORIENTATION TOGGLE ==========
  if (orientationToggle) {
    orientationToggle.addEventListener('click', function() {
      isLandscape = !isLandscape;
      updateFrameDimensions(true);
      orientationLabel.textContent = isLandscape ? 'Portrait' : 'Landscape';
      savePreferences();
    });
  }

  // ========== PREFERENCES ==========
  function getStorageKey() {
    return 'playbox-preview-prefs';
  }

  function savePreferences() {
    try {
      var prefs = { device: currentDevice, landscape: isLandscape };
      localStorage.setItem(getStorageKey(), JSON.stringify(prefs));
    } catch (e) {}
  }

  function loadPreferences() {
    try {
      var stored = localStorage.getItem(getStorageKey());
      if (stored) {
        var prefs = JSON.parse(stored);
        if (prefs.device && DEVICES[prefs.device]) {
          return prefs;
        }
      }
    } catch (e) {}
    return null;
  }

  // ========== WINDOW RESIZE ==========
  var resizeTimeout = null;
  window.addEventListener('resize', function() {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      updateFrameDimensions(false);
    }, 100);
  });

  // ========== INITIALIZATION ==========

  // Load saved preferences
  var savedPrefs = loadPreferences();
  if (savedPrefs) {
    currentDevice = savedPrefs.device;
    isLandscape = !!savedPrefs.landscape;
    if (isLandscape) {
      orientationLabel.textContent = 'Portrait';
    }
  }

  // Find the device name for the label
  DEVICE_GROUPS.forEach(function(group) {
    group.devices.forEach(function(dev) {
      if (dev.id === currentDevice) {
        deviceDropdownLabel.textContent = dev.name;
      }
    });
  });

  // Build dropdown and set initial frame dimensions
  buildDeviceDropdown();
  updateFrameDimensions(false);

  // Remove no-transition class after layout settles
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      phoneFrame.classList.remove('no-transition');
    });
  });

  // ========== FETCH NETWORKS & INIT TABS ==========
  fetch('/api/networks').then(function(r) { return r.json(); }).then(function(data) {
    networks = data;
    var tabsEl = document.getElementById('tabs');
    data.forEach(function(net) {
      var btn = document.createElement('button');
      btn.className = 'tab';
      btn.textContent = net.name || net.id;
      btn.dataset.id = net.id;
      btn.onclick = function() { loadNetwork(net.id); };
      tabsEl.appendChild(btn);
    });
    if (data.length > 0) loadNetwork(data[0].id);
  });
})();
