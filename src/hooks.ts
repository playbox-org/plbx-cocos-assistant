declare const Editor: any;

import { getProjectSettings } from './core/settings';
import { buildPackageRequest } from './core/package-request';
import { packageForNetworks } from '@playbox-ai/playable-kit';

export async function onAfterBuild(options: any, result: any): Promise<void> {
  const pkgOptions = options.packages?.['plbx-cocos-extension'];
  const dest = result?.dest;
  console.log('[plbx] Build finished. Output:', dest);

  // Always notify the panel about the build
  Editor.Message.send('plbx-cocos-extension', 'on-build-finished', {
    dest,
    platform: options?.platform,
  });

  // `dest` is recorded by main.onBuildFinished, which the message above always
  // reaches — including when auto-package is off, which is exactly the case that
  // left Pack All packaging a stale directory. One writer, no double-write.

  // Auto-package if enabled. The build task's own option wins when it carries
  // one — that is the checkbox in the Cocos build panel, and the value our
  // Build button injects. A task with no such option at all (built before the
  // extension was installed, or one Cocos rebuilt its options block for) falls
  // back to the panel's "Auto-package after build" setting, which is where
  // operators actually look for this switch.
  let settings;
  try {
    settings = await getProjectSettings();
  } catch (e: any) {
    console.error('[plbx] Auto-package error:', e?.message ?? e);
    return;
  }
  const autoPackage = pkgOptions?.autoPackage ?? settings.autoPackage;
  if (!autoPackage) return;
  if (!dest) {
    console.warn('[plbx] Auto-package skipped: no build output path');
    return;
  }

  try {
    // buildPackageRequest defaults to settings.selectedNetworks; this only
    // guards the empty case so the log below says why nothing happened.
    if (!settings.selectedNetworks?.length) {
      console.log('[plbx] Auto-package skipped: no networks selected');
      return;
    }

    // Same request builder as the panel's Pack All — the two paths drifting is
    // exactly what produced "one build, two different artifacts". `dest` is the
    // one thing the hook knows better than settings: the real build output.
    const request = buildPackageRequest({
      settings,
      projectRoot: Editor.Project.path || '',
      buildDir: dest,
    });

    // Names, not just a count: "packaging for 4 networks" gave no way to see
    // that the saved list was stale, which is how a build silently packaged
    // the previous selection instead of the one on screen.
    console.log(
      `[plbx] Auto-packaging ${request.networks.length} networks [${request.networks.join(', ')}] ` +
      `from ${request.buildDir} → ${request.outputDir}`,
    );
    const result = await packageForNetworks({
      ...request,
      onProgress: (id, status, msg) => {
        console.log(`[plbx] ${id}: ${status} ${msg || ''}`);
      },
    });

    // PackageResult has no `status` field — this used to filter on
    // r.status === 'success'/'error', so the line always read "0 success,
    // 0 failed". The packager's per-network catch pushes a row with an empty
    // outputPath, which is the real signal.
    const passed = result.results.filter((r: any) => r.outputPath);
    const failed = result.results.filter((r: any) => !r.outputPath);
    console.log(
      `[plbx] Auto-package complete: ${passed.length} success` +
      `${passed.length ? ` [${passed.map((r: any) => r.networkId).join(', ')}]` : ''}, ` +
      `${failed.length} failed` +
      `${failed.length ? ` [${failed.map((r: any) => r.networkId).join(', ')}]` : ''} ` +
      `(${(result.totalTime / 1000).toFixed(1)}s)`,
    );

    // Notify panel to refresh results
    Editor.Message.send('plbx-cocos-extension', 'on-auto-package-done', result);
  } catch (e: any) {
    console.error('[plbx] Auto-package error:', e?.message ?? e);
  }
}
