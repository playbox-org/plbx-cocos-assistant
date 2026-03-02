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
- **自动生成适配脚本** — 生成包含各平台 CTA 和生命周期逻辑的 `plbx_playable.ts`
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

| 平台 | 体积限制 |
|------|---------|
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
| GDT（腾讯） | 5 MB |
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

## 使用方法

### 1. 在 Cocos Creator 中构建

将项目以 **web-mobile** 模式构建。扩展将自动检测构建结果。

### 2. 添加适配脚本

在 Package 标签页点击 **"Generate plbx_playable.ts"**，将在 `assets/Scripts/plbx_html/plbx_playable.ts` 创建一个薄层适配器，向游戏代码暴露平台无关的方法：

```typescript
import plbx from './plbx_html/plbx_playable';

plbx.download();    // 跳转到应用商店（CTA）
plbx.game_end();    // 通知广告平台游戏结束
plbx.is_audio();    // 检查是否允许音频
```

在游戏中调用这些方法——打包器会在构建时自动注入各平台对应的实现。

### 3. 打包

选择平台并点击 **Package**。打包器将：

1. 获取 web-mobile 构建
2. 注入 `window.plbx_html`（及别名 `window.super_html`），包含各平台的 CTA 和生命周期路由
3. 生成独立的 HTML 或 ZIP 文件

`super_html` 注入对所有打包构建自动生效，无论目标平台如何。游戏代码保持平台无关，所有路由由打包器处理。

### 4. 验证

打开 **Package** 标签页，选择平台并点击 **Preview**。内置验证器在 iframe 中加载可试玩广告并检查：

- 文件大小是否在平台限制内
- 游戏是否无错误加载
- CTA 是否正确触发
- 生命周期事件是否按正确顺序触发
- 是否存在外部网络请求

## 安装

```bash
cd your-cocos-project/extensions
git clone https://github.com/playbox-org/plbx-cocos-assistant.git plbx-cocos-extension
cd plbx-cocos-extension
npm install
npm run build
```

打开 Cocos Creator——扩展将自动加载。通过 **Panel → Playbox** 打开面板。

### 系统要求

- Cocos Creator **3.8.0+**
- Node.js **18+**
- FFmpeg *(可选——音频压缩所需)*

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
