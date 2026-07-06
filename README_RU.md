# Playbox — Расширение для Cocos Creator

[![Cocos Creator](https://img.shields.io/badge/Cocos_Creator-3.8%2B-blue)](https://www.cocos.com/en/creator)
[![Networks](https://img.shields.io/badge/ad_networks-30%2B-green)](#поддерживаемые-сети)
[![License](https://img.shields.io/github/license/playbox-org/plbx-cocos-assistant)](https://github.com/playbox-org/plbx-cocos-assistant/blob/master/LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)]()

**Инструменты разработки playable-рекламы для Cocos Creator — упаковка, валидация и сжатие ассетов для 30+ рекламных сетей.**

**[English README](README.md)** | **[中文 README](README_ZH.md)**

![Playbox Extension](assets/screenshot.jpg)

## Возможности

### 1. Упаковка для рекламных сетей — [30+ сетей](#поддерживаемые-сети)

Упакуйте web-mobile билд в самодостаточный HTML или ZIP playable для каждой рекламной сети одной кнопкой.

- **Выбор сетей** — выбирайте только нужные сети для каждого проекта
- **Автогенерация адаптера** — генерирует `plbx_html_playable.ts` с логикой CTA и lifecycle для каждой сети
- **Автоопределение билда** — автоматически подхватывает последний web-mobile билд Cocos Creator
- **Автоупаковка** — переупаковка автоматически после каждой сборки в Cocos Creator (вкл/выкл)
- **Кастомные имена файлов** — шаблоны путей с переменными `{networkId}`, `{ext}` и пользовательскими токенами
- **Облачный деплой** — загрузка упакованных креативов в [Playbox Cloud](https://plbx.ai) для шаринга и ревью

### 2. Валидация билдов

Тестируйте packaged playable во встроенном браузерном превью с моками SDK для каждой сети и чеклистом валидации — не выходя из Cocos Creator.

- **Трекинг колбеков сетей** — отслеживает lifecycle-события (gameReady, gameStart, gameEnd, gameClose) с результатами по каждому
- **Трекинг Axon Events** (AppLovin) — извлекает вызовы `trackEvent()` из исходника и проверяет их срабатывание при превью
- **Эмуляция устройств** — фреймы iPhone, Pixel, Galaxy, iPad с переключением ориентации
- **Моки SDK** — MRAID, DAPI и методы CTA для каждой сети инжектируются автоматически
- **Подсказки по исправлению** — при провале проверки показывает конкретные инструкции и ссылки на официальные валидаторы

<video src="https://github.com/user-attachments/assets/7334bd5c-f90e-4b1b-b4cc-7bbdaaad8204" autoplay loop muted playsinline></video>

### 3. Build Report

Сканируйте ассеты проекта и смотрите, что попало в билд — и в каком размере.

- **Разбивка по категориям** — Engine (cc.js), Plugins, Assets, Scripts, Other
- **Статус каждого ассета** — подтверждён в билде, предсказан или не используется
- **Размеры packed HTML** — итоговый размер по каждой сети после упаковки

### 4. Сжатие ассетов

Сжимайте изображения (WebP / JPEG / PNG / AVIF) и аудио (MP3 / OGG) с превью и настройкой качества перед упаковкой.

<video src="https://github.com/user-attachments/assets/ab57c518-0f64-4809-a315-eb81109aa58a" autoplay loop muted playsinline></video>

## Поддерживаемые сети

Упаковщик автоматически выбирает нужный формат вывода и SDK-адаптер под каждую сеть.

- **HTML** — AppLovin, Unity Ads, ironSource, AdColony, Tapjoy, Appreciate, Chartboost, Liftoff, Smadex, Rubeex, Facebook / Meta, Moloco, Nefta, inMobi, NewsBreak
- **ZIP** — Google Ads, Pangle, TikTok, Vungle, MyTarget, Mintegral, Adikteev, Bigabid, Snapchat, Bigo Ads, GDT (Tencent), Kwai, Yandex
- **Launcher API** — Moloco V2.0 (`launcher.html` + `payload.js`)

## Как использовать

### 1. Собрать билд в Cocos Creator

Соберите проект как **web-mobile** в Cocos Creator. Расширение определит билд автоматически.

### 2. Добавить адаптер

Во вкладке Package нажмите **Generate plbx_html.ts**. Будет создан файл `assets/Scripts/plbx_html/plbx_html_playable.ts` — тонкая обёртка с сетенезависимыми методами для кода игры:

```typescript
import plbx from './plbx_html/plbx_html_playable';

plbx.game_ready();  // сцена загружена, игра готова
plbx.tap();         // каждый тап игрока
plbx.download();    // CTA — переход в магазин
plbx.game_end();    // геймплей завершён
if (plbx.is_muted()) { /* не запускать звук */ }

// команда, которую могут вызвать внешний код / Playbox Preview:
plbx.expose('show_endcard', () => this.showEndcard(), 'Show endcard');
```

Вызывайте эти методы в игре — упаковщик подставит правильную реализацию для каждой сети при сборке.

> **AppLovin — Axon-аналитика (опционально).** AppLovin ожидает [Axon playable-analytics события](https://support.axon.ai/en/growth/promoting-your-apps/creatives/playable-analytics-integration) через `ALPlayableAnalytics.trackEvent(...)`. Нажмите **Generate AppLovin events** во вкладке Package, чтобы сгенерировать helper рядом с `plbx_html`, затем вызывайте события из геймплея (`DISPLAYED` обязателен). Встроенный валидатор извлекает ваши вызовы `trackEvent()` и проверяет, что они срабатывают — в правильном порядке и без дублей — во время Preview.

### 3. Упаковать

Выберите сети и нажмите **Package**. Упаковщик:

1. Берёт web-mobile билд
2. Инжектирует `window.plbx_html` — роутинг CTA и lifecycle под каждую сеть
3. Генерирует самодостаточные HTML или ZIP файлы

Код игры остаётся сетенезависимым — весь роутинг на стороне упаковщика.

> **Совместимость с super-html.** Для удобства упаковщик также выставляет
> `window.super_html` как алиас `plbx_html`. Если вы раньше использовали super-html
> в своём проекте, ваши существующие вызовы `super_html.*` продолжат работать в
> plbx-билдах без изменений — переписывать ничего не нужно. В новых проектах
> используйте `plbx_html`.

### 4. Валидация

Откройте вкладку **Package**, выберите сеть и нажмите **Preview**. Встроенный валидатор загружает playable в iframe и проверяет:

- Размер файла в пределах лимита сети
- Игра загружается без ошибок
- CTA срабатывает корректно
- Lifecycle-события приходят в правильном порядке
- Нет внешних сетевых запросов

## Установка

### Для пользователей (рекомендуется)

Скачайте готовую сборку — без git, `npm` и шага компиляции.

1. Возьмите `plbx-cocos-extension-vX.Y.Z.zip` из [последнего релиза](https://github.com/playbox-org/plbx-cocos-assistant/releases/latest).
2. Распакуйте в глобальную папку расширений Cocos:
   - **macOS:** `~/.CocosCreator/extensions/plbx-cocos-extension/`
   - **Windows:** `%USERPROFILE%\.CocosCreator\extensions\plbx-cocos-extension\`

   (или в `<ваш-проект>/extensions/` для одного проекта)
3. Перезапустите Cocos Creator. Панель — **Panel → Playbox**.

Дальше **обновление в один клик** из панели держит расширение свежим: скачивает
последний релиз и подменяет на месте — нужно лишь перезапустить редактор.

### Для разработчиков расширения

```bash
git clone https://github.com/playbox-org/plbx-cocos-assistant.git plbx-cocos-extension
cd plbx-cocos-extension
npm install
npm run build
```

В Cocos Creator: **Extension Manager → Developer Import** → выбрать эту папку.
Это симлинк на ваш checkout, поэтому self-update здесь отключён — обновляйтесь
через `git pull` (и `npm install` / `npm run build`, если менялись зависимости).

### Требования

- Cocos Creator **3.8.0+**
- Node.js **18+** *(только для установки из исходников; пользовательская сборка уже собрана)*
- FFmpeg *(опционально — нужен для сжатия аудио)*

## Решение проблем

**Сжатие изображений просит установить `sharp`**

`sharp` — опциональная нативная библиотека под каждую платформу, поэтому она
поставляется *вне* сборки. При первом сжатии картинки панель предложит установку
в один клик — **Установить sharp** — примите её, и сжатие готово.

Если авто-установка не удалась, выполните в папке расширения и снова откройте
вкладку «Сжатие»:

```bash
npm install sharp
```

## Разработка

```bash
npm run build        # компиляция TypeScript
npm run watch        # режим наблюдения
npm run test         # запуск тестов (vitest)
npm run test:watch   # тесты в режиме наблюдения
```

Для загрузки расширения из исходников в Cocos Creator: откройте **Extension Manager**, нажмите **Developer Import** и выберите папку расширения.

## Лицензия

[Apache License 2.0](LICENSE)
