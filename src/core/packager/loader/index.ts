/**
 * Self-contained loader assembly.
 *
 * Emission order matters — later blocks reference earlier definitions, and the
 * unpack IIFE runs immediately and calls plbx_boot():
 *   1. shared helpers      (_suffixMatch, _findAsset, mime, buffers)
 *   2. module hooks        (plbx_reg_search, _installPlbxUrlShim, plbx_patch_system)
 *   3. asset I/O           (plbx_getRes, _PlbxLocalRequest, plbx_install_downloader)
 *   4. lifecycle           (plbx_boot, plbx_boot_engine)
 *   5. unpack IIFE         (builds __plbx_res, then calls plbx_boot) — LAST
 */
import type { RuntimeLoaderOptions } from '../runtime-loader';
import { emitSharedHelpers } from './shared';
import { emitModuleHooks } from './modules';
import { emitAssetIO } from './assets';
import { emitLifecycle } from './lifecycle';
import { emitUnpack } from './unpack';

export function generateSelfContainedLoader(options: RuntimeLoaderOptions = {}): string {
  return [
    emitSharedHelpers(),
    emitModuleHooks(options),
    emitAssetIO(options),
    emitLifecycle(options),
    emitUnpack(options),
  ].join('\n');
}
