import { describe, it, expect } from 'vitest';
import { buildPackageRequest } from '../../src/core/package-request';
import { DEFAULT_SETTINGS } from '../../src/core/settings';

const ROOT = 'D:/PBGame/HighCore-C2';

const settings = {
  ...DEFAULT_SETTINGS,
  selectedNetworks: ['applovin', 'unity'],
  buildDir: 'build/web-mobile',
  outputDir: 'build/plbx-html',
  outputTemplate: '{networkId}/RSE_{network}.{ext}',
  orientation: 'landscape' as const,
  molocoAssetProvider: 'Playbox',
  molocoAssetTitle: 'Roadside',
};

describe('buildPackageRequest', () => {
  it('gives auto-package and Pack All the same request when the input is the same', () => {
    // The two entry points drifted: the hook silently dropped outputTemplate, so
    // one wrote {networkId}/index.html and the other the configured name — two
    // artifacts in one folder that read as "one build packaged to two sizes".
    const fromHook = buildPackageRequest({
      settings,
      projectRoot: ROOT,
      buildDir: `${ROOT}/build/web-mobile`,
    });
    const fromPanel = buildPackageRequest({
      settings,
      projectRoot: ROOT,
      buildDir: 'build/web-mobile',
    });
    expect(fromHook).toEqual(fromPanel);
  });

  it('carries the configured output template', () => {
    const req = buildPackageRequest({ settings, projectRoot: ROOT });
    expect(req.outputTemplate).toBe('{networkId}/RSE_{network}.{ext}');
  });

  it('resolves both directories against the project root', () => {
    const req = buildPackageRequest({ settings, projectRoot: ROOT });
    expect(req.buildDir).toBe(`${ROOT}/build/web-mobile`);
    expect(req.outputDir).toBe(`${ROOT}/build/plbx-html`);
  });

  it('derives the packaging config from settings', () => {
    const req = buildPackageRequest({ settings, projectRoot: ROOT });
    expect(req.config.orientation).toBe('landscape');
    expect(req.config.assetEncodings).toEqual(['base64']);
  });

  it('lets an explicit config override a setting, without dropping the rest', () => {
    const req = buildPackageRequest({
      settings,
      projectRoot: ROOT,
      config: { orientation: 'portrait' },
    });
    expect(req.config.orientation).toBe('portrait');
    expect(req.config.loaderMode).toBe('self-contained');
  });

  it('merges Moloco launcher metadata into template variables', () => {
    const req = buildPackageRequest({ settings, projectRoot: ROOT });
    expect(req.templateVariables.assetProvider).toBe('Playbox');
    expect(req.templateVariables.assetTitle).toBe('Roadside');
  });

  it('lets caller-passed template variables win over the settings-derived ones', () => {
    const req = buildPackageRequest({
      settings,
      projectRoot: ROOT,
      templateVariables: { assetTitle: 'Explicit' },
    });
    expect(req.templateVariables.assetTitle).toBe('Explicit');
  });

  it('defaults the network list to the selected networks', () => {
    expect(buildPackageRequest({ settings, projectRoot: ROOT }).networks).toEqual([
      'applovin',
      'unity',
    ]);
    expect(
      buildPackageRequest({ settings, projectRoot: ROOT, networks: ['moloco'] }).networks,
    ).toEqual(['moloco']);
  });

  it('omits an empty output template rather than passing an empty string', () => {
    const req = buildPackageRequest({
      settings: { ...settings, outputTemplate: '' },
      projectRoot: ROOT,
    });
    expect(req.outputTemplate).toBeUndefined();
  });
});
