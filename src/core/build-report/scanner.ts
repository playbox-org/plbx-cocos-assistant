import { AssetReportItem, BuildReport } from '../../shared/types';
import { estimateBuildSize } from './size-estimator';
import { statSync } from 'fs';
import { scanBuildDirectory } from './build-scanner';
import { resolveSceneDependencies, QueryDependenciesFn } from './dependency-resolver';
export type { QueryDependenciesFn } from './dependency-resolver';

// Minimal type matching what Cocos asset-db returns
export interface AssetInfo {
  name: string;
  path: string;
  url: string;
  uuid: string;
  type: string;
  file: string;        // absolute disk path
  isDirectory: boolean;
  importer: string;
}

export type QueryAssetsFn = (type?: string) => Promise<AssetInfo[]>;

const SCAN_TYPES = [
  'cc.Texture2D',
  'cc.SpriteFrame',
  'cc.AudioClip',
  'cc.Prefab',
  'cc.AnimationClip',
  'cc.Material',
  'cc.Mesh',
  'cc.JsonAsset',
];

export async function scanAssets(
  queryFn: QueryAssetsFn,
  projectName: string,
): Promise<BuildReport> {
  const assets: AssetReportItem[] = [];

  for (const type of SCAN_TYPES) {
    const items = await queryFn(type);
    for (const item of items) {
      if (item.isDirectory) continue;

      let sourceSize = 0;
      try {
        sourceSize = statSync(item.file).size;
      } catch {
        // file may not exist on disk (virtual asset)
        continue;
      }

      const extension = item.name.includes('.')
        ? '.' + item.name.split('.').pop()!.toLowerCase()
        : '';

      const buildSize = estimateBuildSize({
        type: item.type,
        sourceSize,
        extension,
      });

      assets.push({
        uuid: item.uuid,
        name: item.name,
        path: item.path,
        file: item.file,
        type: item.type,
        sourceSize,
        buildSize,
        extension,
        buildStatus: 'unused',
      });
    }
  }

  // Sort by sourceSize descending
  assets.sort((a, b) => b.sourceSize - a.sourceSize);

  return {
    timestamp: Date.now(),
    projectName,
    totalSourceSize: assets.reduce((sum, a) => sum + a.sourceSize, 0),
    totalBuildSize: assets.reduce((sum, a) => sum + a.buildSize, 0),
    buildDirExists: false,
    assets,
  };
}

/**
 * Hybrid asset scan: combines project assets with build data and dependency analysis.
 *
 * Merge priority:
 * 1. All project assets start as 'unused'
 * 2. Scene dependencies → 'predicted'
 * 3. Build directory data → 'confirmed' + actualBuildSize
 */
export async function scanAssetsHybrid(
  queryFn: QueryAssetsFn,
  queryDeps: QueryDependenciesFn,
  projectName: string,
  buildDir?: string,
  sceneUuids?: string[],
): Promise<BuildReport> {
  // Step 1: Get all project assets (all marked 'unused' by default)
  const baseReport = await scanAssets(queryFn, projectName);
  const assets = baseReport.assets;

  // Step 2: Dependency analysis → mark as 'predicted'
  if (sceneUuids && sceneUuids.length > 0) {
    const depResult = await resolveSceneDependencies(sceneUuids, queryDeps);
    for (const asset of assets) {
      if (depResult.referencedUuids.has(asset.uuid)) {
        asset.buildStatus = 'predicted';
      }
    }
  }

  // Step 3: Build directory data → mark as 'confirmed' + set actualBuildSize
  let buildDirExists = false;
  let buildTimestamp: number | undefined;
  let totalActualBuildSize: number | undefined;
  let buildCategories: import('../../shared/types').BuildCategories | undefined;
  let packedHtmls: import('../../shared/types').PackedHtmlEntry[] | undefined;

  if (buildDir) {
    const buildScan = await scanBuildDirectory(buildDir);
    if (buildScan) {
      buildDirExists = true;
      buildTimestamp = buildScan.buildTimestamp;
      // Use the full directory size (engine + scripts + assets)
      totalActualBuildSize = buildScan.totalBuildSize;
      buildCategories = buildScan.categories;
      packedHtmls = buildScan.packedHtmls;

      for (const asset of assets) {
        const buildData = buildScan.assetMap.get(asset.uuid);
        if (buildData) {
          asset.buildStatus = 'confirmed';
          asset.actualBuildSize = buildData.actualSize;
        } else if (buildScan.bundledUuids.has(asset.uuid)) {
          // In bundle config but no native file — still confirmed
          asset.buildStatus = 'confirmed';
        }
      }
    }
  }

  // Step 4: Compute totals from non-unused assets only
  const includedAssets = assets.filter(a => a.buildStatus !== 'unused');
  const totalBuildSize = includedAssets.reduce((sum, a) => sum + a.buildSize, 0);
  const totalSourceSize = includedAssets.reduce((sum, a) => sum + a.sourceSize, 0);

  return {
    timestamp: Date.now(),
    projectName,
    totalSourceSize,
    totalBuildSize,
    totalActualBuildSize,
    buildDirExists,
    buildTimestamp,
    buildCategories,
    packedHtmls,
    assets,
  };
}

/** Create a query function that wraps Cocos Editor.Message.request */
export function createEditorQueryFn(editorMessage: any): QueryAssetsFn {
  return async (type?: string) => {
    const options = type ? { type } : {};
    return editorMessage.request('asset-db', 'query-assets', options);
  };
}
