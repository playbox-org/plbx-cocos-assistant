interface SizeEstimateInput {
  type: string;       // Cocos asset type e.g. 'cc.Texture2D'
  sourceSize: number; // bytes
  extension: string;  // e.g. '.png'
}

// Heuristic ratios: estimated_build_size / source_size
const RATIO_MAP: Record<string, number> = {
  // Textures - usually similar size, PNG might get optimized slightly
  'cc.Texture2D': 0.95,
  'cc.SpriteFrame': 0.95,
  'cc.RenderTexture': 1.0,
  // Audio - compressed formats pass through, WAV gets compressed
  'cc.AudioClip': 0.9,
  // Scripts - bundled and minified
  'cc.Script': 0.6,
  // Data - roughly same
  'cc.JsonAsset': 1.0,
  'cc.Prefab': 0.9,
  'cc.AnimationClip': 0.9,
  'cc.Material': 0.95,
  'cc.Mesh': 1.0,
};

// Extension-specific overrides (take priority over type ratio)
const EXT_RATIO: Record<string, number> = {
  '.wav': 0.15,    // WAV -> compressed = big reduction
  '.bmp': 0.3,     // BMP -> PNG = big reduction
  '.tga': 0.4,     // TGA -> compressed
  '.psd': 0.2,     // PSD not included in build usually
};

export function estimateBuildSize(input: SizeEstimateInput): number {
  const { type, sourceSize, extension } = input;

  // 1. Check extension override first
  if (extension in EXT_RATIO) {
    return Math.round(sourceSize * EXT_RATIO[extension]);
  }

  // 2. Then check type ratio
  if (type in RATIO_MAP) {
    return Math.round(sourceSize * RATIO_MAP[type]);
  }

  // 3. Default to 1.0 (pass-through)
  return sourceSize;
}

export function estimateCompressedSize(
  size: number,
  contentType: 'text' | 'binary' = 'binary',
): number {
  if (size === 0) return 0;

  // Text compresses better (~35% of original)
  // Binary compresses less (~70% of original)
  const ratio = contentType === 'text' ? 0.35 : 0.70;
  return Math.round(size * ratio);
}
