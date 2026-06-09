// One-off: repackage molocoV2 for piggy-merge using compiled dist/ (fixed macros + ASSET_REVISION).
const { packageForNetworks } = require('../dist/core/packager/packager');

const BASE = '/Users/pavelsamoylenko/Documents/GitHub/Playbox/Playables/_Prod/moloco-piggy-merge/build';

(async () => {
  const res = await packageForNetworks({
    buildDir: `${BASE}/web-mobile`,
    outputDir: `${BASE}/plbx-html`,
    networks: ['molocoV2'],
    config: { orientation: 'auto' },
    templateVariables: { assetTitle: 'Piggy Merge' },
    onProgress: (n, s, m) => console.log(`[${n}] ${s}${m ? ' — ' + m : ''}`),
  });
  console.log(JSON.stringify(res.results.map(r => ({ network: r.networkId, ok: !r.error, error: r.error })), null, 2));
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
