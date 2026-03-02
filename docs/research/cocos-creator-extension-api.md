# Cocos Creator 3.8 Extension Development: Comprehensive Reference

## 1. Extension Structure

### Directory Layout

```
my-extension/
├── package.json          # Extension manifest (required)
├── tsconfig.json         # TypeScript config
├── src/
│   ├── main.ts           # Main process entry point
│   └── panels/
│       └── default.ts    # Panel definition
├── dist/                 # Compiled output (gitignored)
├── static/
│   ├── template/index.html
│   └── style/index.css
└── i18n/
    ├── en.js
    └── zh.js
```

### Installation Locations

- **Project-level:** `{projectPath}/extensions/my-extension/`
- **Global:** `{home}/.CocosCreator/extensions/my-extension/`

### Complete `package.json` Manifest

```json
{
  "package_version": 2,
  "version": "1.0.0",
  "name": "my-extension",
  "title": "i18n:my-extension.title",
  "description": "i18n:my-extension.description",
  "author": "My Name",
  "editor": ">=3.4.2",
  "main": "./dist/main.js",

  "panels": {
    "default": {
      "title": "i18n:my-extension.panels.default.title",
      "type": "dockable",
      "main": "./dist/panels/default",
      "icon": "./static/icon.png",
      "flags": { "resizable": true, "save": true },
      "size": { "min-width": 400, "min-height": 300, "width": 600, "height": 400 }
    }
  },

  "contributions": {
    "menu": [
      {
        "path": "i18n:menu.panel/My Extension",
        "label": "i18n:my-extension.open_panel",
        "message": "open-panel"
      }
    ],
    "messages": {
      "open-panel": { "methods": ["openPanel"] },
      "scene:ready": { "methods": ["onSceneReady"] }
    },
    "builder": "./dist/builder",
    "profile": {
      "editor":  { "myKey": { "default": "value" } },
      "project": { "myFlag": { "default": false } }
    }
  }
}
```

### `main.ts` Entry Point

```typescript
export const load   = function() { /* extension loaded */ };
export const unload = function() { /* extension unloaded */ };

export const methods: { [key: string]: (...any: any) => any } = {
    openPanel() {
        Editor.Panel.open('my-extension');
    },
};
```

## 2. Panel System

### Panel Definition (`src/panels/default.ts`)

Panels use `Editor.Panel.define()` with template HTML, CSS style, `$` selector map, methods, and lifecycle hooks (`ready`, `close`, `beforeClose`).

Use `readFileSync` to load template and style from static files. The `$` map provides element references by CSS selector. The `ready()` hook fires when DOM is available.

### Panel Types

| Type | Behavior |
|------|----------|
| `dockable` | Can be docked into editor layout like native panels |
| `simple` | Floating window, always on top optional |

### Opening Panels

```typescript
Editor.Panel.open('my-extension');
Editor.Panel.open('my-extension.panelName');
Editor.Panel.close('my-extension');
```

## 3. Message System (IPC)

```typescript
// Fire and forget
Editor.Message.send('packageName', 'message-name', ...args);

// Await result
const result = await Editor.Message.request('packageName', 'message-name', ...args);

// Broadcast
Editor.Message.broadcast('my-extension:data-ready', payload);
```

**Key limitation:** All data transferred via messages is JSON-serialized. No native objects, class instances, or circular references.

## 4. Asset Database API (`asset-db`)

### Full Message Reference

| Message | Parameters | Returns |
|---------|-----------|---------|
| `query-assets` | `QueryAssetsOption?`, `(keyof IAssetInfo)[]?` | `AssetInfo[]` |
| `query-asset-info` | `uuid: string`, `keys?: string[]` | `AssetInfo \| null` |
| `query-asset-meta` | `uuid: string` | `IAssetMeta \| null` |
| `query-path` | `uuid: string` | `string \| null` |
| `query-url` | `uuid: string` | `string \| null` |
| `query-uuid` | `url: string` | `string \| null` |
| `create-asset` | `url: string`, `content: string \| Buffer \| null` | `AssetInfo \| null` |
| `import-asset` | `srcPath: string`, `destUrl: string` | `AssetInfo \| null` |
| `save-asset` | `url: string`, `content: string \| Buffer` | `AssetInfo \| null` |
| `delete-asset` | `url: string` | `AssetInfo \| null` |

### `AssetInfo` Structure

```typescript
interface AssetInfo {
    name: string;
    displayName: string;
    source: string;       // absolute disk path
    path: string;         // relative project path
    url: string;          // db://assets/...
    file: string;         // absolute disk path
    uuid: string;
    importer: string;
    type: string;         // asset type class name
    isDirectory: boolean;
    library: { [ext: string]: string }; // compiled output paths
    subAssets: { [name: string]: AssetInfo };
    visible: boolean;
    readonly: boolean;
}
```

### `QueryAssetsOption` for filtering

```typescript
interface QueryAssetsOption {
    type?: string;      // e.g. "cc.Texture2D"
    pattern?: string;   // glob, e.g. "db://assets/**"
    extension?: string; // e.g. ".png"
}
```

### Asset-DB Events

| Event | Fired when |
|-------|-----------|
| `asset-db:assets-created` | New file appears |
| `asset-db:assets-moved` | File moved/renamed |
| `asset-db:assets-deleted` | File deleted |
| `asset-db:asset-changed` | File content changed |

**No official thumbnail API** — use `assetInfo.library` paths or `Editor.Project.tmpDir`.

## 5. Build Pipeline API (`builder`)

### Registration in `package.json`

```json
{ "contributions": { "builder": "./dist/builder" } }
```

### Builder Config (`src/builder.ts`)

```typescript
export const configs = {
    '*': {
        hooks: './hooks',
        options: {
            myOption: {
                default: false,
                render: { ui: 'ui-checkbox' },
                label: 'My Custom Option'
            }
        }
    }
};
```

### Hooks (`src/hooks.ts`)

```typescript
export async function onBeforeBuild(options: IBuildTaskOptions): Promise<void> {}
export async function onBeforeCompressSettings(options, result): Promise<void> {}
export async function onAfterCompressSettings(options): Promise<void> {}
export async function onAfterBuild(options, result): Promise<void> {
    console.log('Build output at:', result.dest);
}
```

### Custom Texture Compression (`src/asset-handlers.ts`)

The `compressTextures` function receives an array of `ICompressTask` objects. Process each task (access `task.src`, `task.dest`, `task.format`, `task.quality`), then splice handled tasks from the array. Remaining tasks pass to Cocos default handler.

### Build Limitation

`options` in hooks is **read-only copy**. Mutating it does not affect the build.

## 6. Other Editor APIs

```typescript
// Dialogs
const paths = await Editor.Dialog.select({ multi: false, type: 'directory' });
await Editor.Dialog.info('Done!', { title: 'My Extension' });

// Selection
Editor.Selection.select('node', uuid);
Editor.Selection.getSelected('node');

// Profile (persistent settings)
await Editor.Profile.setConfig('my-extension', 'myKey', 'value', 'local');
await Editor.Profile.setProject('my-extension', 'myFlag', true, 'local');

// Project info
Editor.Project.path;
Editor.Project.name;
```

## 7. Limitations and Gotchas

| Issue | Detail |
|-------|--------|
| All IPC is JSON-only | Cannot pass native objects or Buffers |
| Build hook options are copies | Modifying options in hook does nothing |
| No official thumbnail API | Must read compiled library files |
| Compilation required | TypeScript must be compiled to dist/ |
| Message names | Must be lowercase with hyphens only |
| Panel hot-reload | Run `npm run build` then reload extension |
| TypeScript types | Use `@cocos/creator-types` package |
