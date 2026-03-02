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
  var axonExpected = [];   // event names extracted from source
  var axonFired = {};      // { eventName: count }
  var currentValidatorUrl = null;

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
      var icons = { pending: '\u23F3', pass: '\u2705', fail: '\u274C' };

      var div = document.createElement('div');
      div.className = 'check' + (c.status === 'fail' ? ' fail' : '');

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

  function renderAxonEvents() {
    var section = document.getElementById('axon-section');
    var container = document.getElementById('axon-events');
    var emptyMsg = document.getElementById('axon-empty');
    if (!section || !container) return;

    // Only show for AppLovin
    if (!isAxonNetwork) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';
    while (container.firstChild) container.removeChild(container.firstChild);

    // Merge: all known events = expected + any runtime-only events
    var allEvents = axonExpected.slice();
    Object.keys(axonFired).forEach(function(name) {
      if (allEvents.indexOf(name) === -1) allEvents.push(name);
    });

    if (allEvents.length === 0) {
      emptyMsg.style.display = '';
      return;
    }
    emptyMsg.style.display = 'none';

    allEvents.forEach(function(name) {
      var count = axonFired[name] || 0;
      var div = document.createElement('div');
      div.className = 'axon-event' + (count > 0 ? ' fired' : '');

      var icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = count > 0 ? '\u26A1' : '\u23F3';
      div.appendChild(icon);

      var nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      nameSpan.textContent = name;
      div.appendChild(nameSpan);

      var countSpan = document.createElement('span');
      countSpan.className = 'count';
      countSpan.textContent = count > 0 ? '\u00D7' + count : '\u2014';
      div.appendChild(countSpan);

      container.appendChild(div);
    });
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

    // Axon Events: fetch expected events for AppLovin
    axonExpected = [];
    axonFired = {};
    isAxonNetwork = (id === 'applovin');
    if (isAxonNetwork) {
      fetch('/api/axon-events/' + id)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          axonExpected = data.events || [];
          renderAxonEvents();
        })
        .catch(function() { /* no axon events */ });
    }
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
  function showCtaToast(method) {
    var toast = document.getElementById('cta-toast');
    if (!toast) return;
    toast.textContent = 'CTA Clicked' + (method ? ' — ' + method : '');
    toast.className = 'cta-toast visible';
    clearTimeout(ctaToastTimer);
    ctaToastTimer = setTimeout(function() {
      toast.className = 'cta-toast fade-out';
      setTimeout(function() { toast.className = 'cta-toast'; }, 400);
    }, 1500);
  }

  // ========== POST MESSAGE LISTENER ==========
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'plbx:preview') return;
    var evt = e.data.event;
    var data = e.data.data || {};

    var logMsg = '[preview] ' + evt;
    if (data.url) logMsg += ' url=' + data.url;
    if (data.message) logMsg += ' ' + data.message;
    log(logMsg, evt === 'error' ? 'error' : evt === 'cta' ? 'cta' : '');

    switch (evt) {
      case 'mraid_ready': setCheck('mraid_ready', 'pass'); break;
      case 'game_ready': setCheck('game_ready', 'pass'); break;
      case 'game_start': setCheck('game_start', 'pass'); break;
      case 'cta':
        setCheck('cta', 'pass', data.method || 'called');
        showCtaToast(data.method);
        break;
      case 'game_close': setCheck('game_close', 'pass'); break;
      case 'game_end': setCheck('game_end', 'pass'); break;
      case 'error': setCheck('no_errors', 'fail', data.message || 'Exception detected'); break;
      case 'external_request': setCheck('no_external', 'fail', data.url || 'External request detected'); break;
      case 'axon_event':
        if (data.name) {
          axonFired[data.name] = (axonFired[data.name] || 0) + 1;
          log('Axon: ' + data.name + ' (×' + axonFired[data.name] + ')', 'cta');
          renderAxonEvents();
        }
        break;
      case 'preview_loaded': log('preview-util.js initialized for ' + data.networkId); break;
    }
  });

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
