import { AssetReportItem, BuildReport } from '../../shared/types';
import { estimateBuildSize } from './size-estimator';
import { statSync } from 'fs';

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
        type: item.type,
        sourceSize,
        buildSize,
        extension,
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
