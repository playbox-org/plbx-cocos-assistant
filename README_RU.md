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
- **Автогенерация адаптера** — генерирует `plbx_playable.ts` с логикой CTA и lifecycle для каждой сети
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

| Сеть | Лимит размера |
|------|--------------|
| AppLovin | 5 MB |
| Unity Ads | 5 MB |
| ironSource | 5 MB |
| Facebook / Meta | 5 MB |
| Google Ads | 5 MB |
| Mintegral | 5 MB |
| TikTok / Pangle | 5 MB |
| Vungle | 5 MB |
| Liftoff | 5 MB |
| Moloco | 5 MB |
| Snapchat | 5 MB |
| Bigo Ads | 5 MB |
| GDT (Tencent) | 5 MB |
| Chartboost | 3 MB |
| Yandex | 3 MB |
| AdColony | 2 MB |
| MyTarget | 2 MB |
| Tapjoy | 1.9 MB |
| Appreciate | 5 MB |
| Smadex | 5 MB |
| Rubeex | 5 MB |
| Nefta | 5 MB |
| NewsBreak | 5 MB |
| Kwai | 5 MB |
| inMobi | 5 MB |
| Adikteev | 5 MB |
| Bigabid | 5 MB |

## Как использовать

### 1. Собрать билд в Cocos Creator

Соберите проект как **web-mobile** в Cocos Creator. Расширение определит билд автоматически.

### 2. Добавить адаптер

Нажмите **"Generate plbx_playable.ts"** во вкладке Package. Будет создан файл `assets/Scripts/plbx_html/plbx_playable.ts` — тонкая обёртка, которая предоставляет сетенезависимые методы коду игры:

```typescript
import plbx from './plbx_html/plbx_playable';

plbx.download();    // переход в магазин (CTA)
plbx.game_end();    // уведомить рекламную сеть об окончании геймплея
plbx.is_audio();    // проверить, разрешён ли звук
```

Вызывайте эти методы в игре — упаковщик подставит правильную реализацию для каждой сети при сборке.

### 3. Упаковать

Выберите сети и нажмите **Package**. Упаковщик:

1. Берёт web-mobile билд
2. Инжектирует `window.plbx_html` (и алиас `window.super_html`) с роутингом CTA и lifecycle под каждую сеть
3. Генерирует самодостаточные HTML или ZIP файлы

Инжект `super_html` происходит автоматически для каждого упакованного билда вне зависимости от сети. Код игры остаётся сетенезависимым — весь роутинг на стороне упаковщика.

### 4. Валидация

Откройте вкладку **Package**, выберите сеть и нажмите **Preview**. Встроенный валидатор загружает playable в iframe и проверяет:

- Размер файла в пределах лимита сети
- Игра загружается без ошибок
- CTA срабатывает корректно
- Lifecycle-события приходят в правильном порядке
- Нет внешних сетевых запросов

## Установка

```bash
cd your-cocos-project/extensions
git clone https://github.com/playbox-org/plbx-cocos-assistant.git plbx-cocos-extension
cd plbx-cocos-extension
npm install
npm run build
```

Откройте Cocos Creator — расширение загрузится автоматически. Откройте панель через **Panel → Playbox**.

### Требования

- Cocos Creator **3.8.0+**
- Node.js **18+**
- FFmpeg *(опционально — нужен для сжатия аудио)*

## Решение проблем

**Сжатие изображений не работает — "Could not load sharp"**

Библиотека `sharp` использует нативные бинарники для каждой платформы. Если появилась эта ошибка, пересоберите для вашей ОС:

```bash
# Windows
npm install --os=win32 --cpu=x64 sharp

# macOS / Linux
npm rebuild sharp
```

Выполните в папке расширения (`extensions/plbx-cocos-extension/`), затем перезапустите Cocos Creator.

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
