declare const Editor: any;

import { getProjectSettings } from './core/settings';
import { packageForNetworks } from './core/packager/packager';
import { resolve } from 'path';

export async function onAfterBuild(options: any, result: any): Promise<void> {
  const pkgOptions = options.packages?.['plbx-cocos-extension'];
  const dest = result?.dest;
  console.log('[plbx] Build finished. Output:', dest);

  // Always notify the panel about the build
  Editor.Message.send('plbx-cocos-extension', 'on-build-finished', {
    dest,
    platform: options?.platform,
  });

  // Auto-package if enabled in build settings
  if (!pkgOptions?.autoPackage) return;
  if (!dest) {
    console.warn('[plbx] Auto-package skipped: no build output path');
    return;
  }

  try {
    const settings = await getProjectSettings();
    const networks = settings.selectedNetworks;
    if (!networks?.length) {
      console.log('[plbx] Auto-package skipped: no networks selected');
      return;
    }

    const projectRoot = Editor.Project.path || '';
    const buildDir = dest; // use actual build output path
    const outputDir = resolve(projectRoot, settings.outputDir || 'build/plbx-html');

    const config = {
      storeUrlIos: settings.storeUrlIos,
      storeUrlAndroid: settings.storeUrlAndroid,
      orientation: settings.orientation,
    };

    console.log(`[plbx] Auto-packaging for ${networks.length} networks → ${outputDir}`);
    const result = await packageForNetworks({
      buildDir,
      outputDir,
      networks,
      config,
      onProgress: (id, status, msg) => {
        console.log(`[plbx] ${id}: ${status} ${msg || ''}`);
      },
    });

    const passed = result.results.filter((r: any) => r.status === 'success').length;
    const failed = result.results.filter((r: any) => r.status === 'error').length;
    console.log(`[plbx] Auto-package complete: ${passed} success, ${failed} failed (${(result.totalTime / 1000).toFixed(1)}s)`);

    // Notify panel to refresh results
    Editor.Message.send('plbx-cocos-extension', 'on-auto-package-done', result);
  } catch (e: any) {
    console.error('[plbx] Auto-package error:', e?.message ?? e);
  }
}
