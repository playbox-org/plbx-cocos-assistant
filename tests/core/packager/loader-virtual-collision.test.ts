import { describe, it, expect } from 'vitest';
import { emitSharedHelpers } from '../../../src/core/packager/loader/shared';

// Regression: a CommonJS Cocos build registers virtual modules like
// 'chunks:///_virtual/index.js' (the real CJS module exporting __cjsMetaURL) and
// a wrapper 'chunks:///_virtual/index.mjs_cjs=&original=.js'. The loader's
// instantiate()/fetch() probe `_findAsset('./' + normalized)` as a third
// fallback. Prepending './' to an already-virtual URL used to defeat
// _isVirtualScheme (regex anchored at ^chunks:), re-enabling suffix matching:
// './chunks:///_virtual/index.js'.endsWith('/index.js') collided with the real
// boot 'index.js' asset → the boot file was served as the CJS module → no
// __cjsMetaURL → Cocos throwInvalidWrapper → grey screen.
function makeHelpers(res: Record<string, string>) {
  const win: any = { __plbx_res: res, __plbx_bin: {}, __plbx_js: res };
  const factory = new Function(
    'window',
    emitSharedHelpers() +
      '\nreturn { _findAsset: _findAsset, _isVirtualScheme: _isVirtualScheme };',
  );
  return factory(win);
}

describe('virtual-scheme suffix-match collision (cjs index.js grey screen)', () => {
  it('treats a ./-prefixed virtual chunk URL as a cache miss (not the boot index.js)', () => {
    const { _findAsset } = makeHelpers({
      'index.js': 'BOOT',
      'assets/main/index.js': 'MAIN',
    });
    // Must be a miss so SystemJS resolves it via its named registry.
    expect(_findAsset('./chunks:///_virtual/index.js')).toBeNull();
  });

  it('treats the raw virtual chunk URL as a cache miss', () => {
    const { _findAsset } = makeHelpers({ 'index.js': 'BOOT' });
    expect(_findAsset('chunks:///_virtual/index.js')).toBeNull();
  });

  it('_isVirtualScheme matches a leading ./ before the virtual scheme', () => {
    const { _isVirtualScheme } = makeHelpers({});
    expect(_isVirtualScheme('./chunks:///_virtual/index.js')).toBe(true);
    expect(_isVirtualScheme('chunks:///_virtual/index.js')).toBe(true);
    expect(_isVirtualScheme('./virtual:///x.js')).toBe(true);
    // real relative assets must still be matchable
    expect(_isVirtualScheme('./assets/main/index.js')).toBe(false);
    expect(_isVirtualScheme('index.js')).toBe(false);
  });
});
