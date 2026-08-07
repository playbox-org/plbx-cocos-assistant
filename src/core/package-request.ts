/**
 * Single source of truth for what gets packaged.
 *
 * Auto-package (hooks.onAfterBuild) and Pack All (main.packageNetworks) used to
 * assemble the packager's arguments independently, and they drifted:
 *   - the hook took `result.dest`, the panel took a hand-typed field, and nobody
 *     reconciled them — so a build task writing to `build/web-mobile-001` left
 *     Pack All packaging a stale `build/web-mobile` from an earlier build. Same
 *     project, different game code, ~800 KB apart, and the older build had no
 *     Google Play URL, so validation failed on one artifact and passed on the
 *     other. It read as "the packager is non-deterministic".
 *   - the hook never passed `outputTemplate`, so it wrote `{networkId}/index.{ext}`
 *     while the panel wrote the configured name — two differently-named files in
 *     one folder, easily mistaken for one build packaged twice.
 *
 * Both entry points now build their request here. Overrides exist for what the
 * caller genuinely knows better (the hook knows the real build output; the panel
 * knows the checkbox selection), and everything else comes from settings once.
 */

import { resolve } from 'path';
import type { PackageConfig } from '@playbox-ai/playable-kit';
import { toPackageConfig, type ProjectSettings } from './settings';

export interface PackageRequestInput {
  settings: ProjectSettings;
  projectRoot: string;
  /** Overrides settings.buildDir — the hook passes the build's actual `dest`. */
  buildDir?: string;
  /** Overrides settings.selectedNetworks — the panel passes the checked boxes. */
  networks?: string[];
  /** Merged over the settings-derived config (panel sends orientation). */
  config?: Partial<PackageConfig>;
  /** Merged last, so an explicit caller value wins over the settings-derived one. */
  templateVariables?: Record<string, string>;
}

export interface PackageRequest {
  buildDir: string;
  outputDir: string;
  networks: string[];
  config: PackageConfig;
  outputTemplate?: string;
  templateVariables: Record<string, string>;
}

/** Forward slashes throughout, so the two entry points cannot differ by separator
 *  alone and comparisons in tests/diagnostics stay stable. Node accepts both. */
function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

export function buildPackageRequest(input: PackageRequestInput): PackageRequest {
  const { settings, projectRoot } = input;

  return {
    buildDir: norm(resolve(projectRoot, input.buildDir ?? settings.buildDir ?? '')),
    outputDir: norm(resolve(projectRoot, settings.outputDir || 'build/plbx-html')),
    networks: input.networks ?? settings.selectedNetworks,
    config: { ...toPackageConfig(settings), ...input.config },
    // Empty string would be a template that resolves to nothing; the kit's own
    // default is the right fallback.
    outputTemplate: settings.outputTemplate || undefined,
    templateVariables: {
      ...settings.templateVariables,
      ...(settings.molocoAssetProvider ? { assetProvider: settings.molocoAssetProvider } : {}),
      ...(settings.molocoAssetTitle ? { assetTitle: settings.molocoAssetTitle } : {}),
      ...input.templateVariables,
    },
  };
}
