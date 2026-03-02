import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { extractUuidFromPath, decompressUuid } from './uuid-utils';
import { BuildCategories, PackedHtmlEntry } from '../../shared/types';

export interface BuildAssetData {
  buildPaths: string[];
  actualSize: number;
}

export interface BuildScanResult {
  buildDir: string;
  buildTimestamp: number;
  totalBuildSize: number;     // sum of ALL files in the build directory (assets + engine + scripts)
  assetFilesSize: number;     // subset: files in native/ + import/ (asset data only)
  packFileSize: number;       // subset of assetFilesSize: pack files that can't be attributed to one UUID
  categories: BuildCategories;
  packedHtmls: PackedHtmlEntry[];
  assetMap: Map<string, BuildAssetData>;
  bundledUuids: Set<string>;  // base hex UUIDs from config.json (fragments stripped, decompressed)
}

/**
 * Scan a Cocos 3.8 build output directory and map assets by UUID.
 * Returns null if the directory doesn't exist.
 */
export async function scanBuildDirectory(buildDir: string): Promise<BuildScanResult | null> {
  if (!existsSync(buildDir)) return null;

  const assetMap = new Map<string, BuildAssetData>();
  let assetFilesSize = 0;
  let packFileSize = 0;

  // Get build timestamp from directory mtime
  const buildTimestamp = statSync(buildDir).mtimeMs;

  // Compute total size of ALL files in build directory (includes engine, scripts, assets)
  const cats = { engine: 0, plugins: 0, assets: 0, scripts: 0, other: 0 };
  let totalBuildSize = 0;
  // Regex: matches paths inside native/ or import/ subdirectory of any bundle
  const ASSET_FILE_RE = /^assets\/[^/]+\/(native|import)\//;
  for (const f of scanDirRecursive(buildDir)) {
    totalBuildSize += f.size;
    const rel = relative(buildDir, f.path).replace(/\\/g, '/');
    if (rel.startsWith('assets/')) {
      // native/ and import/ files go to cats.assets (also tracked in assetFilesSize via bundle scan below)
      // Other asset/ files (config.json, index.js, etc.) go to 'other'
      if (ASSET_FILE_RE.test(rel)) {
        cats.assets += f.size;
      } else {
        cats.other += f.size;
      }
    } else {
      categorizeFile(rel, f.size, cats);
    }
  }

  // Read settings to discover bundles
  const bundles = discoverBundles(buildDir);

  // Collect pack file IDs from all bundle configs
  const packIds = new Set<string>();
  const bundledUuids = new Set<string>();

  for (const bundle of bundles) {
    const configPath = join(buildDir, 'assets', bundle, 'config.json');
    if (!existsSync(configPath)) continue;

    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      // Collect pack IDs
      if (config.packs) {
        for (const packId of Object.keys(config.packs)) {
          packIds.add(packId);
        }
      }
      // Build bundledUuids from uuids array
      if (Array.isArray(config.uuids)) {
        for (const entry of config.uuids) {
          // Strip @fragment suffix
          const base = entry.split('@')[0];
          // Skip pack file pseudo-UUIDs (not exactly 22-char base64)
          if (base.length !== 22) continue;
          const hex = decompressUuid(base);
          if (hex) bundledUuids.add(hex);
        }
      }
    } catch {
      // Invalid config, skip
    }
  }

  // Scan native/ and import/ directories for each bundle
  for (const bundle of bundles) {
    for (const subdir of ['native', 'import']) {
      const dir = join(buildDir, 'assets', bundle, subdir);
      if (!existsSync(dir)) continue;

      const files = scanDirRecursive(dir);
      for (const file of files) {
        const relPath = relative(join(buildDir, 'assets', bundle), file.path);
        const size = file.size;
        assetFilesSize += size;

        const extraction = extractUuidFromPath(relPath);
        if (!extraction) {
          // Likely a pack file — check against packIds
          const filename = file.path.split('/').pop() ?? '';
          const nameNoExt = filename.replace(/\.[^.]+$/, '');
          if (packIds.has(nameNoExt)) {
            packFileSize += size;
          }
          continue;
        }

        const existing = assetMap.get(extraction.uuid);
        if (existing) {
          existing.buildPaths.push(relPath);
          existing.actualSize += size;
        } else {
          assetMap.set(extraction.uuid, {
            buildPaths: [relPath],
            actualSize: size,
          });
        }
      }
    }
  }

  // Scan sibling plbx-html/ directory for packed HTMLs
  const packedHtmls: PackedHtmlEntry[] = [];
  const plbxHtmlDir = join(buildDir, '..', 'plbx-html');
  if (existsSync(plbxHtmlDir)) {
    try {
      for (const entry of readdirSync(plbxHtmlDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const htmlPath = join(plbxHtmlDir, entry.name, 'index.html');
        if (existsSync(htmlPath)) {
          packedHtmls.push({
            network: entry.name,
            size: statSync(htmlPath).size,
          });
        }
      }
      packedHtmls.sort((a, b) => b.size - a.size);
    } catch {
      // ignore unreadable dirs
    }
  }

  return {
    buildDir,
    buildTimestamp,
    totalBuildSize,
    assetFilesSize,
    packFileSize,
    categories: {
      engine: cats.engine,
      plugins: cats.plugins,
      assets: cats.assets,
      scripts: cats.scripts,
      other: cats.other,
    },
    packedHtmls,
    assetMap,
    bundledUuids,
  };
}

/**
 * Accumulates the size of a file (relative to buildDir) into the correct category.
 * 'assets' category is tracked separately via assetFilesSize — do NOT call this
 * for paths starting with 'assets/'.
 */
function categorizeFile(
  relPath: string,
  size: number,
  cats: { engine: number; plugins: number; scripts: number; other: number },
): void {
  const norm = relPath.replace(/\\/g, '/');

  if (norm.startsWith('cocos-js/')) {
    const filename = norm.split('/').pop() ?? '';
    if (filename === 'cc.js') {
      cats.engine += size;
    } else {
      cats.plugins += size;
    }
    return;
  }

  if (norm.startsWith('src/')) {
    const filename = norm.split('/').pop() ?? '';
    if (filename.endsWith('.bundle.js') || norm.startsWith('src/chunks/')) {
      cats.scripts += size;
      return;
    }
  }

  cats.other += size;
}

/** Read src/settings.json to get project bundles, fallback to directory listing */
function discoverBundles(buildDir: string): string[] {
  const settingsPath = join(buildDir, 'src', 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const bundles = settings.assets?.projectBundles;
      if (Array.isArray(bundles) && bundles.length > 0) return bundles;
    } catch {
      // fall through
    }
  }
  // Fallback: list directories under assets/
  const assetsDir = join(buildDir, 'assets');
  if (!existsSync(assetsDir)) return [];
  return readdirSync(assetsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

interface FileEntry { path: string; size: number }

function scanDirRecursive(dir: string): FileEntry[] {
  const result: FileEntry[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...scanDirRecursive(full));
    } else {
      result.push({ path: full, size: statSync(full).size });
    }
  }
  return result;
}
