declare const Editor: any;

import type { PackageConfig } from '../shared/types';
import { normalizeLang, DEFAULT_LANG, type Lang } from './i18n/locales';

export interface ProjectSettings {
  selectedNetworks: string[];
  projectName: string;
  deploymentName: string;
  deployProjectId: string;
  defaultDeployNetwork: string;
  orientation: 'portrait' | 'landscape' | 'auto';
  autoPackage: boolean;
  buildDir: string;
  outputDir: string;
  outputTemplate: string;
  templateVariables: Record<string, string>;
  /** Runtime loader engine. 'self-contained' = origin-independent plbx loader; 'systemjs' = legacy. */
  loaderMode: 'self-contained' | 'systemjs';
  /** Networks pinned to the legacy SystemJS loader regardless of loaderMode. */
  legacyLoaderNetworks: string[];
  /** Loading splash shown until the first rendered Cocos frame:
   *  'none' = no splash, 'playbox' = PLBX branded splash, 'custom' = client logo
   *  (customSplashLogo) on a plain black screen. */
  splashMode: 'none' | 'playbox' | 'custom';
  /** Absolute path to a client logo (PNG/JPG/WebP) for splashMode 'custom'.
   *  Persisted across mode switches so toggling back to custom keeps the file. */
  customSplashLogo: string;
  /** Asset-container encodings to emit (self-contained loader only). Default
   *  ['base64'] (most stable, fastest boot, larger file). base122 is ~14% smaller
   *  but less robust. ['base64','base122'] emits both — index.html (base122) +
   *  sibling index.b64.html. Invariant: at least one entry. */
  assetEncodings: ('base64' | 'base122')[];
  /** Moloco Ad Account ID for CDN asset uploads (per-project; API key is global). */
  molocoAdAccountId: string;
  /** Moloco launcher ASSET_PROVIDER metadata override (empty → network default "Playbox"). */
  molocoAssetProvider: string;
  /** Moloco launcher ASSET_TITLE metadata override (empty → project name). */
  molocoAssetTitle: string;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  selectedNetworks: ['ironsource', 'applovin', 'google', 'facebook', 'unity', 'mintegral', 'moloco'],
  projectName: '',  // will default to project folder name
  deploymentName: '',
  deployProjectId: '',
  defaultDeployNetwork: 'ironsource',
  orientation: 'auto',
  autoPackage: true,
  buildDir: 'build/web-mobile',
  outputDir: 'build/plbx-html',
  outputTemplate: '{networkId}/index.{ext}',
  templateVariables: {},
  loaderMode: 'self-contained',
  legacyLoaderNetworks: [],
  splashMode: 'playbox',
  customSplashLogo: '',
  assetEncodings: ['base64'],
  molocoAdAccountId: '',
  molocoAssetProvider: '',
  molocoAssetTitle: '',
};

/**
 * Map ProjectSettings → PackageConfig, carrying the loader-engine fields
 * (loaderMode / legacyLoaderNetworks) the rollback path depends on. Both the
 * panel package handler (via main.ts) and the auto-package hook MUST build
 * config through this — otherwise a settings.json `legacyLoaderNetworks`
 * rollback is silently dropped and never reaches the packager.
 */
export function toPackageConfig(s: ProjectSettings): PackageConfig {
  return {
    orientation: s.orientation,
    loaderMode: s.loaderMode,
    legacyLoaderNetworks: s.legacyLoaderNetworks,
    showSplash: s.splashMode !== 'none',
    customSplashLogo: s.splashMode === 'custom' ? s.customSplashLogo || '' : '',
    assetEncodings: s.assetEncodings && s.assetEncodings.length ? s.assetEncodings : ['base64'],
  };
}

/** Get project-scoped settings */
export async function getProjectSettings(): Promise<ProjectSettings> {
  try {
    const saved = await Editor.Profile.getProject('plbx-cocos-extension', 'settings', 'local');
    const rawName = sanitizeProjectName(saved?.projectName);
    const projectName = rawName || getDefaultProjectName();
    const merged = { ...DEFAULT_SETTINGS, ...saved, projectName };
    // Migrate legacy boolean showSplash → splashMode (pre-dropdown settings).
    if (saved && saved.splashMode === undefined) {
      merged.splashMode = saved.showSplash === false ? 'none'
        : saved.customSplashLogo ? 'custom' : 'playbox';
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS, projectName: getDefaultProjectName() };
  }
}

/** Save project-scoped settings */
export async function saveProjectSettings(settings: Partial<ProjectSettings>): Promise<void> {
  const current = await getProjectSettings();
  const merged = { ...current, ...settings };
  if (settings.projectName !== undefined) {
    merged.projectName = sanitizeProjectName(settings.projectName) || getDefaultProjectName();
  }
  await Editor.Profile.setProject('plbx-cocos-extension', 'settings', merged, 'local');
}

/** Strip path-like junk if user (or buggy default) saved a full path. */
export function sanitizeProjectName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const looksLikePath = /[\\/]|^[A-Za-z]:/.test(value);
  if (!looksLikePath) return value.trim();
  const segments = value.split(/[/\\]/).filter(Boolean);
  return (segments.pop() || '').trim();
}

/** Get global PLBX API token (shared across all projects) */
export async function getGlobalToken(): Promise<string> {
  try {
    return await Editor.Profile.getConfig('plbx-cocos-extension', 'apiKey', 'local') || '';
  } catch {
    return '';
  }
}

/** Save global PLBX API token */
export async function saveGlobalToken(token: string): Promise<void> {
  await Editor.Profile.setConfig('plbx-cocos-extension', 'apiKey', token, 'local');
}

/** Moloco CDN API key — secret, global (per-developer), never in project files. */
export async function getMolocoApiKey(): Promise<string> {
  try {
    return (await Editor.Profile.getConfig('plbx-cocos-extension', 'molocoApiKey', 'local')) || '';
  } catch {
    return '';
  }
}

export async function saveMolocoApiKey(key: string): Promise<void> {
  await Editor.Profile.setConfig('plbx-cocos-extension', 'molocoApiKey', key, 'local');
}

/**
 * Whether to auto-open the Playbox panel when the editor starts.
 * Global (per-developer, all projects); defaults to true when never set.
 */
export async function getShowPanelOnStart(): Promise<boolean> {
  try {
    const v = await Editor.Profile.getConfig('plbx-cocos-extension', 'showPanelOnStart', 'local');
    return v !== false; // undefined/null → default on
  } catch {
    return true;
  }
}

export async function saveShowPanelOnStart(show: boolean): Promise<void> {
  await Editor.Profile.setConfig('plbx-cocos-extension', 'showPanelOnStart', show, 'local');
}

/** Panel UI language. Global (per-developer); defaults to English. */
export async function getLanguage(): Promise<Lang> {
  try {
    const v = await Editor.Profile.getConfig('plbx-cocos-extension', 'language', 'local');
    return normalizeLang(v);
  } catch {
    return DEFAULT_LANG;
  }
}

export async function saveLanguage(lang: string): Promise<void> {
  await Editor.Profile.setConfig('plbx-cocos-extension', 'language', normalizeLang(lang), 'local');
}

function getDefaultProjectName(): string {
  try {
    const path: string = Editor.Project.path;
    const segments = path.split(/[/\\]/).filter(Boolean);
    return segments.pop() || 'untitled';
  } catch {
    return 'untitled';
  }
}
