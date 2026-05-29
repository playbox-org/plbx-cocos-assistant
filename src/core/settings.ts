declare const Editor: any;

import type { PackageConfig } from '../shared/types';

export interface ProjectSettings {
  selectedNetworks: string[];
  projectName: string;
  deploymentName: string;
  deployProjectId: string;
  defaultDeployNetwork: string;
  storeUrlIos: string;
  storeUrlAndroid: string;
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
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  selectedNetworks: ['ironsource', 'applovin', 'google', 'facebook', 'unity', 'mintegral', 'moloco'],
  projectName: '',  // will default to project folder name
  deploymentName: '',
  deployProjectId: '',
  defaultDeployNetwork: 'ironsource',
  storeUrlIos: '',
  storeUrlAndroid: '',
  orientation: 'auto',
  autoPackage: true,
  buildDir: 'build/web-mobile',
  outputDir: 'build/plbx-html',
  outputTemplate: '{networkId}/index.{ext}',
  templateVariables: {},
  loaderMode: 'self-contained',
  legacyLoaderNetworks: [],
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
    storeUrlIos: s.storeUrlIos,
    storeUrlAndroid: s.storeUrlAndroid,
    orientation: s.orientation,
    loaderMode: s.loaderMode,
    legacyLoaderNetworks: s.legacyLoaderNetworks,
  };
}

/** Get project-scoped settings */
export async function getProjectSettings(): Promise<ProjectSettings> {
  try {
    const saved = await Editor.Profile.getProject('plbx-cocos-extension', 'settings', 'local');
    const rawName = sanitizeProjectName(saved?.projectName);
    const projectName = rawName || getDefaultProjectName();
    return { ...DEFAULT_SETTINGS, ...saved, projectName };
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

function getDefaultProjectName(): string {
  try {
    const path: string = Editor.Project.path;
    const segments = path.split(/[/\\]/).filter(Boolean);
    return segments.pop() || 'untitled';
  } catch {
    return 'untitled';
  }
}
