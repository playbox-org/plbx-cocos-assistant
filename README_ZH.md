# Playbox — Cocos Creator 扩展

[![Cocos Creator](https://img.shields.io/badge/Cocos_Creator-3.8%2B-blue)](https://www.cocos.com/en/creator)
[![Networks](https://img.shields.io/badge/ad_networks-30%2B-green)](#支持的广告平台)
[![License](https://img.shields.io/github/license/playbox-org/plbx-cocos-assistant)](https://github.com/playbox-org/plbx-cocos-assistant/blob/master/LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)]()

**面向 Cocos Creator 的可试玩广告开发工具——支持 30+ 广告平台的打包、验证与资源压缩。**

**[English README](README.md)** | **[README 俄语版](README_RU.md)**

![Playbox Extension](assets/screenshot.jpg)

## 功能特性

### 1. 广告平台打包 — [30+ 平台](#支持的广告平台)

一键将 web-mobile 构建打包为每个广告平台所需的独立 HTML 或 ZIP 可试玩广告。

- **选择平台** — 按项目选择所需平台
- **自动生成适配脚本** — 生成包含各平台 CTA 和生命周期逻辑的 `plbx_html_playable.ts`
- **自动检测构建** — 自动识别最新的 Cocos Creator web-mobile 构建
- **自动打包** — Cocos Creator 构建完成后可选择自动重新打包（可开关）
- **自定义输出命名** — 支持 `{networkId}`、`{ext}` 及自定义变量的模板路径
- **云端部署** — 直接上传打包好的素材到 [Playbox Cloud](https://plbx.ai) 进行分享与审核

### 2. 构建验证

在内置浏览器预览中测试打包好的可试玩广告，包含各平台 SDK Mock 和验证清单——无需离开 Cocos Creator。

- **平台回调追踪** — 监控各平台生命周期事件（gameReady、gameStart、gameEnd、gameClose）并显示通过/失败状态
- **Axon Events 追踪**（AppLovin）— 从源码中提取 `trackEvent()` 调用，并在预览时验证其触发情况
- **设备模拟** — 支持 iPhone、Pixel、Galaxy、iPad 框架及横竖屏切换
- **SDK Mock** — 自动注入 MRAID、DAPI 及各平台专属 CTA 方法
- **修复提示** — 检查失败时显示具体修复说明及官方验证器链接

<video src="https://github.com/user-attachments/assets/7334bd5c-f90e-4b1b-b4cc-7bbdaaad8204" autoplay loop muted playsinline></video>

### 3. 构建报告

扫描项目资源，精确了解哪些内容进入了构建包——以及各自的体积。

- **分类体积** — 引擎（cc.js）、插件、资源、脚本、其他
- **单资源状态** — 已确认在构建中、预测存在或未使用
- **打包后 HTML 体积** — 显示每个平台打包后的最终文件大小

### 4. 资源压缩

在打包前压缩图片（WebP / JPEG / PNG / AVIF）和音频（MP3 / OGG），支持实时预览和质量调节。

<video src="https://github.com/user-attachments/assets/ab57c518-0f64-4809-a315-eb81109aa58a" autoplay loop muted playsinline></video>

## 支持的广告平台

打包器会自动为每个平台选择正确的输出格式和 SDK 适配器。

- **HTML** — AppLovin、Unity Ads、ironSource、AdColony、Tapjoy、Appreciate、Chartboost、Liftoff、Smadex、Rubeex、Facebook / Meta、Moloco、Nefta、inMobi、NewsBreak
- **ZIP** — Google Ads、Pangle、TikTok、Vungle、MyTarget、Mintegral、Adikteev、Bigabid、Snapchat、Bigo Ads、GDT（腾讯）、Kwai、Yandex
- **Launcher API** — Moloco V2.0（`launcher.html` + `payload.js`）

## 使用方法

### 1. 在 Cocos Creator 中构建

将项目以 **web-mobile** 模式构建。扩展将自动检测构建结果。

### 2. 添加适配脚本

在 Package 标签页点击 **Generate plbx_html.ts**，将在 `assets/Scripts/plbx_html/plbx_html_playable.ts` 创建一个薄层适配器，向游戏代码暴露平台无关的方法：

```typescript
import plbx from './plbx_html/plbx_html_playable';

plbx.game_ready();  // 场景加载完成，游戏就绪
plbx.tap();         // 玩家每次点击
plbx.download();    // CTA — 跳转到应用商店
plbx.game_end();    // 游戏结束
if (plbx.is_muted()) { /* 不要启动音频 */ }

// 注册一个外部调用方 / Playbox Preview 可触发的命令：
plbx.expose('show_endcard', () => this.showEndcard(), 'Show endcard');
```

在游戏中调用这些方法——打包器会在构建时自动注入各平台对应的实现。

> **AppLovin — Axon 分析事件（可选）。** AppLovin 需要通过 `ALPlayableAnalytics.trackEvent(...)` 上报 [Axon 可试玩分析事件](https://support.axon.ai/en/growth/promoting-your-apps/creatives/playable-analytics-integration)。在 Package 标签页点击 **Generate AppLovin events** 在 `plbx_html` 旁生成 helper，然后从游戏逻辑中触发这些事件（`DISPLAYED` 为必需）。内置验证器会提取你的 `trackEvent()` 调用，并在 Preview 时检查它们是否按正确顺序且去重触发。

### 3. 打包

选择平台并点击 **Package**。打包器将：

1. 获取 web-mobile 构建
2. 注入 `window.plbx_html` —— 各平台的 CTA 和生命周期路由
3. 生成独立的 HTML 或 ZIP 文件

游戏代码保持平台无关，所有路由由打包器处理。

> **super-html 兼容性。** 为方便起见，打包器同时将 `window.super_html` 作为
> `plbx_html` 的别名暴露。如果你之前在项目中使用过 super-html，现有的
> `super_html.*` 调用在 plbx 构建中可继续正常工作——无需改写。新项目直接使用
> `plbx_html` 即可。

### 4. 验证

打开 **Package** 标签页，选择平台并点击 **Preview**。内置验证器在 iframe 中加载可试玩广告并检查：

- 文件大小是否在平台限制内
- 游戏是否无错误加载
- CTA 是否正确触发
- 生命周期事件是否按正确顺序触发
- 是否存在外部网络请求

## 安装

### 面向用户（推荐）

下载预构建包——无需 git、`npm` 或编译步骤。

1. 从[最新 Release](https://github.com/playbox-org/plbx-cocos-assistant/releases/latest) 下载 `plbx-cocos-extension-vX.Y.Z.zip`。
2. 解压到 Cocos 全局扩展目录：
   - **macOS：** `~/.CocosCreator/extensions/plbx-cocos-extension/`
   - **Windows：** `%USERPROFILE%\.CocosCreator\extensions\plbx-cocos-extension\`

   （或解压到 `<你的项目>/extensions/` 用于单个项目）
3. 重启 Cocos Creator。通过 **Panel → Playbox** 打开面板。

此后面板的**一键更新**会保持其最新：下载最新 Release 并就地替换——你只需重启编辑器。

### 面向扩展开发者

```bash
git clone https://github.com/playbox-org/plbx-cocos-assistant.git plbx-cocos-extension
cd plbx-cocos-extension
npm install
npm run build
```

在 Cocos Creator 中：**Extension Manager → Developer Import** → 选择此文件夹。
这是指向你 checkout 的软链接，因此这里禁用自更新——请用 `git pull` 更新
（若依赖有变动再执行 `npm install` / `npm run build`）。

### 系统要求

- Cocos Creator **3.8.0+**
- Node.js **18+** *(仅源码安装需要；用户包已预构建)*
- FFmpeg *(可选——音频压缩所需)*

## 常见问题

**图片压缩提示安装 `sharp`**

`sharp` 是可选的、平台相关的原生库，因此它随包*之外*分发。首次压缩图片时面板会
提供一键**安装 sharp**——接受即可，压缩随即就绪。

如果自动安装失败，请在扩展文件夹中执行，然后重新打开压缩标签页：

```bash
npm install sharp
```

## 开发

```bash
npm run build        # 编译 TypeScript
npm run watch        # 监听模式
npm run test         # 运行测试（vitest）
npm run test:watch   # 测试监听模式
```

在 Cocos Creator 中从源码加载扩展：打开 **Extension Manager**，点击 **Developer Import**，选择扩展文件夹。

## 许可证

[Apache License 2.0](LICENSE)
