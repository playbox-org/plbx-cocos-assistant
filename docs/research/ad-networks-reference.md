# Ad Networks Reference

Combined data from playable-template (27 networks), cocos-pnp (11 networks), and playable-scripts (22 networks).

## Output Format per Network

| Network | Output Format | MRAID | Special Requirements |
|---|---|---|---|
| **AppLovin** | Single HTML | Yes | `mraid.js` |
| **Unity Ads** | Single HTML | Yes | `mraid.js` |
| **ironSource** | Single HTML | Yes | `mraid.js` |
| **AdColony** | Single HTML | Yes | `mraid.js` |
| **Tapjoy** | Single HTML | No | — |
| **Appreciate** | Single HTML | Yes | `mraid.js` |
| **Chartboost** | Single HTML | Yes | `mraid.js` |
| **Liftoff** | Single HTML | Yes | `mraid.js` |
| **Smadex** | Single HTML | No | — |
| **Facebook/Meta** | HTML (ZIP optional) | No | `FbPlayableAd.onCTAClick()` |
| **Moloco** | HTML (ZIP optional) | No | `FbPlayableAd.onCTAClick()` |
| **Google Ads** | ZIP | No | `ExitApi.exit()`, ad-size/ad-orientation meta tags |
| **Pangle** | ZIP | No | Pangle SDK script |
| **TikTok** | ZIP | No | `config.json` with `playable_orientation` |
| **Vungle** | ZIP | No | — |
| **MyTarget** | ZIP | Yes | `mraid.js` |
| **Mintegral** | ZIP | No | JS bundle named `creative.js`, custom viewport meta |
| **Adikteev** | ZIP | Yes | JS bundle named `creative.js`, `mraid.js` |
| **Bigabid** | ZIP | Yes | JS bundle named `main.js`, `mraid.js` |
| **inMobi** | ZIP | Yes | JS bundle named `main.js`, `mraid.js` |
| **Snapchat** | ZIP | No | `config.json` with `orientation` |
| **Rubeex** | Single HTML | No | — |

## Size Limits (from playable-template NETWORKS config)

| Network | Max Size | Format |
|---|---|---|
| Google Ads | 5 MB | ZIP |
| Meta/Facebook | 5 MB | HTML |
| AppLovin | 5 MB | HTML |
| Unity Ads | 5 MB | HTML |
| ironSource | 5 MB | HTML |
| Vungle | 5 MB | ZIP |
| Mintegral | 2-5 MB | ZIP |
| TikTok/Pangle | 2-4 MB | ZIP |
| Snapchat | 5 MB | ZIP |

**Note:** Size limits change frequently. Always verify against current network specs.

## CTA Methods

| Method | Networks |
|---|---|
| MRAID (`mraid.open()`) | ironSource, AppLovin, Unity, Appreciate, Chartboost, MyTarget, Liftoff, AdColony, Adikteev, Bigabid, inMobi |
| `FbPlayableAd.onCTAClick()` | Meta, Moloco |
| `ExitApi.exit()` | Google Ads |
| `openAppStore()` | TikTok, Pangle |
| `window.mintGameClose()` | Mintegral |
| `window.open()` | Fallback |

## SDK/Script Injection

| Network | Injected Script |
|---|---|
| MRAID networks | `<script src="mraid.js"></script>` in `<head>` |
| Google Ads | `<script src="https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js"></script>` |
| Pangle | `<script src="https://sf3-ttcdn-tos.pstatp.com/obj/union-fe-nc/playable/sdk/playable-sdk.js"></script>` |
| TikTok | `<script src="https://sf1-ttcdn-tos.pstatp.com/obj/ttfe/union/playable/sdk/index.b5662ec443f458c8a87e.js"></script>` |
| Mintegral | Inline JS: `gameStart()` -> `window.mintGameStart`, `gameClose()` -> `window.mintGameClose` |

## Special ZIP Structures

| Network | ZIP Structure |
|---|---|
| Mintegral | `mintegral/mintegral.html` + assets |
| TikTok | `index.html` + `config.json` |
| Snapchat | `index.html` + `config.json` |
| Google Ads | `index.html` + assets |
| Standard ZIP | `index.html` + assets (flat) |

## Categories Summary

- **Always ZIP:** Google, Pangle, TikTok, Vungle, MyTarget, Mintegral, Adikteev, Bigabid, inMobi, Snapchat
- **Single inlined HTML:** AppLovin, Unity, ironSource, AdColony, Tapjoy, Appreciate, Chartboost, Liftoff, Smadex, Rubeex
- **HTML default, ZIP optional:** Facebook/Meta, Moloco
