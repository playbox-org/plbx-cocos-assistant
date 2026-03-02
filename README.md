# Playbox — Cocos Creator Extension

Extension for [Cocos Creator 3.8+](https://www.cocos.com/en/creator) that packages web-mobile builds into playable ads for 30+ ad networks.

## Features

| Tab | Description |
|-----|-------------|
| **Build Report** | Scan project assets, compare source vs. build sizes, breakdown by type |
| **Compress** | Image (WebP/JPEG/PNG/AVIF) and audio (MP3/OGG) compression with live preview |
| **Package** | Package web-mobile build into single-file HTML or ZIP for each ad network |
| **Deploy** | Upload packaged creatives to [Playbox](https://plbx.ai) cloud |

### Auto-Package After Build

When enabled (default: **on**), the extension automatically packages your web-mobile build into all selected networks right after Cocos Creator finishes building. Toggle in Package tab → "Auto-package after build".

### plbx_html Adapter

Click **"Generate plbx_html.ts"** in the Package tab to create a bridge class at `assets/Scripts/plbx_html/plbx_html_playable.ts`:

```typescript
import plbx from './plbx_html/plbx_html_playable';

plbx.download();       // redirect to store
plbx.game_end();       // notify ad network gameplay ended
plbx.is_audio();       // check if audio is allowed
```

The extension injects `window.plbx_html` (+ `window.super_html` alias) into every packaged build with network-specific download/redirect logic.

## Supported Networks

**HTML** (single file): AppLovin, Unity Ads, ironSource, AdColony, Tapjoy, Appreciate, Chartboost, Liftoff, Smadex, Rubeex, Facebook/Meta, Moloco, Nefta, NewsBreak, Kwai

**ZIP** (multi-file): Google Ads, Pangle, TikTok, Vungle, MyTarget, Mintegral, Adikteev, Bigabid, inMobi, Snapchat, Bigo Ads, GDT (Tencent), Yandex

**Preview**: local testing without network-specific wrappers.

## Installation

1. Clone or symlink this repo into your project's `extensions/` folder:
   ```bash
   cd your-cocos-project/extensions
   git clone <repo-url> plbx-cocos-extension
   cd plbx-cocos-extension
   npm install
   npm run build
   ```
2. Open Cocos Creator — the extension loads automatically.
3. Open the panel: **Panel → Playbox**.

### Requirements

- Cocos Creator **3.8.0+**
- Node.js **18+**
- (Optional) FFmpeg — for audio compression

## Development

```bash
npm run build        # compile TypeScript
npm run watch        # watch mode
npm run test         # run tests (vitest)
npm run test:watch   # tests in watch mode
```

## License

[MIT](LICENSE)

---

# Playbox — Расширение для Cocos Creator

Расширение для [Cocos Creator 3.8+](https://www.cocos.com/en/creator), которое упаковывает web-mobile билды в playable-рекламу для 30+ рекламных сетей.

## Возможности

| Вкладка | Описание |
|---------|----------|
| **Build Report** | Сканирование ассетов проекта, сравнение размеров исходников и билда |
| **Compress** | Сжатие изображений (WebP/JPEG/PNG/AVIF) и аудио (MP3/OGG) с превью |
| **Package** | Упаковка web-mobile билда в HTML или ZIP для каждой рекламной сети |
| **Deploy** | Загрузка упакованных креативов в облако [Playbox](https://plbx.ai) |

### Автоупаковка после билда

Когда включена (по умолчанию: **да**), расширение автоматически упаковывает web-mobile билд во все выбранные сети сразу после завершения сборки в Cocos Creator. Переключатель: Package → "Auto-package after build".

### Адаптер plbx_html

Нажмите **"Generate plbx_html.ts"** во вкладке Package — создаётся bridge-класс в `assets/Scripts/plbx_html/plbx_html_playable.ts`:

```typescript
import plbx from './plbx_html/plbx_html_playable';

plbx.download();       // редирект в стор
plbx.game_end();       // уведомить сеть о завершении геймплея
plbx.is_audio();       // проверить, разрешён ли звук
```

Расширение инжектит `window.plbx_html` (+ алиас `window.super_html`) в каждый упакованный билд с логикой редиректа, специфичной для каждой сети.

## Поддерживаемые сети

**HTML** (один файл): AppLovin, Unity Ads, ironSource, AdColony, Tapjoy, Appreciate, Chartboost, Liftoff, Smadex, Rubeex, Facebook/Meta, Moloco, Nefta, NewsBreak, Kwai

**ZIP** (несколько файлов): Google Ads, Pangle, TikTok, Vungle, MyTarget, Mintegral, Adikteev, Bigabid, inMobi, Snapchat, Bigo Ads, GDT (Tencent), Yandex

**Preview**: локальное тестирование без обёрток рекламных сетей.

## Установка

1. Клонируйте или создайте симлинк в папку `extensions/` проекта:
   ```bash
   cd your-cocos-project/extensions
   git clone <repo-url> plbx-cocos-extension
   cd plbx-cocos-extension
   npm install
   npm run build
   ```
2. Откройте Cocos Creator — расширение загрузится автоматически.
3. Откройте панель: **Panel → Playbox**.

### Требования

- Cocos Creator **3.8.0+**
- Node.js **18+**
- (Опционально) FFmpeg — для сжатия аудио

## Разработка

```bash
npm run build        # компиляция TypeScript
npm run watch        # режим наблюдения
npm run test         # запуск тестов (vitest)
npm run test:watch   # тесты в watch-режиме
```

## Лицензия

[MIT](LICENSE)
