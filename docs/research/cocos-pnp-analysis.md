# cocos-pnp (Cocos Playable Ads Multi-Network Plugin) Analysis

**Repo:** https://github.com/ppgee/cocos-pnp
**Stars:** 329 | **License:** MIT
**Languages:** TypeScript (66.4%), JavaScript (33.0%)

## Overview

Plugin for Cocos Creator that enables exporting playable ads across multiple advertising networks in a single workflow. Supports both Cocos Creator 2.x and 3.x.

## Monorepo Structure

```
cocos-pnp/
├── packages/
│   ├── playable-adapter-core/   # Core adapter logic
│   └── playable-ads-adapter/    # Cocos extension wrapper
├── scripts/                     # Build and utility scripts
├── pnpm-workspace.yaml          # Monorepo config
└── package.json
```

## Supported Ad Networks (11)

AppLovin, Facebook, Google, IronSource, Liftoff, Mintegral, Moloco, Pangle, Rubeex, TikTok, Unity

## Key Features

### Dynamic Channel Replacement
Uses placeholder syntax `'{{__adv_channels_adapter__}}'` to inject channel names during build, enabling channel-specific logic without manual code modification.

### Configuration via `.adapterrc`
JSON config file in project root:
- `buildPlatform` — target platform (web-mobile/web-desktop)
- `orientation` — device orientation (portrait/landscape/auto)
- `exportChannels` — limit output to specific networks
- `skipBuild` — bypass build stage
- `enableSplash` — toggle custom splash screens
- `injectOptions` — add channel-specific scripts to HTML head/body/SDK sections

### Custom Injection
Developers can inject custom HTML, scripts, and SDK code per channel through the `.adapterrc` configuration.

### Package Optimization
- **Pako compression** — enabled by default for reducing package size
- **TinyPNG integration** — optional image compression using API keys

## Installation

- Cocos 2.x: extract to `packages/` folder
- Cocos 3.x: extract to `extensions/` folder

## Build Flow

Select "multi-channel build" in project options -> click "start build" -> automatic adaptation for all selected channels.

## Patterns Reusable for Our Extension

1. **Channel adapter pattern** — per-network adapters with shared interface
2. **`.adapterrc` config** — project-level configuration for build customization
3. **Pako compression** — deflate compression for package size reduction
4. **Channel placeholder injection** — dynamic SDK/script injection per network
5. **Monorepo structure** — core logic separate from extension wrapper
