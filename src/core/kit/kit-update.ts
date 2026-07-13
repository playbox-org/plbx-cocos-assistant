/**
 * Kit install — resolve a newer @playbox-ai/playable-kit and land it in the
 * extension's node_modules.
 *
 * The install itself is the shared isolated one (npm/scratch-install.ts): never in
 * the extension root, and with the kit's own dependencies nested under it, so the
 * root's jszip (which the updater itself requires) is never touched. This module
 * only adds the kit-specific parts: reading the installed version and the declared
 * range, asking npm what is published, and refusing to touch a Developer Import.
 */
import { readFileSync, existsSync } from 'fs';
import { get as httpsGet } from 'https';
import { join } from 'path';
import {
  ScratchInstallIO,
  defaultScratchInstallIO,
  scratchInstall,
} from '../npm/scratch-install';

export const KIT_PKG = '@playbox-ai/playable-kit';

/** Anything reaching a command line is checked against this first. */
const VERSION_RE = /^\d+\.\d+\.\d+$/;

/**
 * Installed kit version. Read the file — do NOT `require(KIT_PKG + '/package.json')`:
 * the kit's `exports` map does not expose ./package.json, so require throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED.
 */
export function readInstalledKitVersion(root: string): string {
  try {
    const p = join(root, 'node_modules', KIT_PKG, 'package.json');
    return JSON.parse(readFileSync(p, 'utf8')).version || '';
  } catch {
    return '';
  }
}

/** Declared range from the extension's own package.json (the bundle ships it verbatim). */
export function readDeclaredRange(root: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return pkg?.dependencies?.[KIT_PKG] || '';
  } catch {
    return '';
  }
}

/**
 * Published versions from npm. Asks for the abbreviated metadata document — the full
 * one carries every version's manifest and grows with each publish. Resolves null on
 * any failure so the check degrades to `unknown` instead of throwing.
 */
export function fetchKitVersions(): Promise<string[] | null> {
  return new Promise((resolve) => {
    const req = httpsGet(
      {
        host: 'registry.npmjs.org',
        path: '/' + KIT_PKG.replace('/', '%2f'),
        headers: {
          'User-Agent': 'plbx-cocos-extension',
          Accept: 'application/vnd.npm.install-v1+json',
        },
        timeout: 6000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            const versions = j?.versions ? Object.keys(j.versions) : null;
            resolve(Array.isArray(versions) ? versions : null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

export interface KitInstallIO extends ScratchInstallIO {
  /** A Developer Import (git checkout). Self-update refuses there; so do we. */
  isDevImport(): boolean;
}

export function defaultKitInstallIO(root: string): KitInstallIO {
  return {
    ...defaultScratchInstallIO('.plbx-kit-staged'),
    isDevImport: () => existsSync(join(root, '.git')),
  };
}

export interface KitInstallResult {
  ok: boolean;
  output: string;
  message: string;
}

export async function installKit(
  root: string,
  version: string,
  io: KitInstallIO,
): Promise<KitInstallResult> {
  if (!VERSION_RE.test(version)) {
    return {
      ok: false,
      output: '',
      message: `Refusing to install a non-semver kit version "${version}".`,
    };
  }
  if (io.isDevImport()) {
    return {
      ok: false,
      output: '',
      message:
        'This is a Developer Import — installing here would rewrite your working tree. ' +
        `Run "npm update ${KIT_PKG}" in the extension folder instead.`,
    };
  }

  try {
    const r = await scratchInstall({ root, pkg: KIT_PKG, spec: version, io });
    if (!r.ok) {
      return {
        ok: false,
        output: r.output,
        message: `Kit install failed. Check the network, or run "npm install ${KIT_PKG}@${version}" in the extension folder.`,
      };
    }
    return {
      ok: true,
      output: r.output,
      message: `Packaging kit ${version} installed — reload the editor to use it.`,
    };
  } catch (e: any) {
    return { ok: false, output: '', message: 'Kit install failed: ' + (e?.message || String(e)) };
  }
}
