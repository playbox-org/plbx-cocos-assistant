import { describe, it, expect } from 'vitest';
import { NETWORKS, getNetwork, getNetworksByFormat, getAllNetworks } from '../../../src/shared/networks';

describe('NETWORKS registry', () => {
  it('should contain at least 20 networks', () => {
    expect(Object.keys(NETWORKS).length).toBeGreaterThanOrEqual(20);
  });

  it('should return network by id', () => {
    const applovin = getNetwork('applovin');
    expect(applovin).toBeDefined();
    expect(applovin!.name).toBe('AppLovin');
    expect(applovin!.format).toBe('html');
    expect(applovin!.mraid).toBe(true);
    expect(applovin!.inlineAssets).toBe(true);
  });

  it('should return undefined for unknown network', () => {
    expect(getNetwork('nonexistent')).toBeUndefined();
  });

  it('should filter networks by format', () => {
    const zipNetworks = getNetworksByFormat('zip');
    expect(zipNetworks.length).toBeGreaterThan(5);
    zipNetworks.forEach(n => expect(n.format).toBe('zip'));

    const htmlNetworks = getNetworksByFormat('html');
    expect(htmlNetworks.length).toBeGreaterThan(5);
    htmlNetworks.forEach(n => expect(n.format).toBe('html'));
  });

  it('should have valid maxSize for all networks', () => {
    Object.values(NETWORKS).forEach(network => {
      expect(network.maxSize).toBeGreaterThan(0);
      expect(network.maxSize).toBeLessThanOrEqual(10 * 1024 * 1024);
    });
  });

  it('google should be single-file ZIP with exitapi', () => {
    const google = getNetwork('google');
    expect(google!.format).toBe('zip');
    expect(google!.singleFileZip).toBe(true);
    expect(google!.mraid).toBe(false);
    expect(google!.sdkUrl).toContain('exitapi');
  });

  it('most ZIP networks should use singleFileZip', () => {
    const singleFileZipIds = ['google', 'mintegral', 'vungle', 'snapchat', 'bigo', 'gdt', 'kwai', 'pangle', 'tiktok', 'mytarget', 'adikteev', 'bigabid'];
    singleFileZipIds.forEach(id => {
      const n = getNetwork(id);
      expect(n, `${id} should exist`).toBeDefined();
      expect(n!.format, `${id} should be zip`).toBe('zip');
      expect(n!.singleFileZip, `${id} should be singleFileZip`).toBe(true);
    });
  });

  it('yandex should be raw ZIP (not singleFileZip)', () => {
    const yandex = getNetwork('yandex');
    expect(yandex!.format).toBe('zip');
    expect(yandex!.singleFileZip).toBeFalsy();
    expect(yandex!.jsBundle).toBe('res.js');
  });

  it('inmobi should be HTML format', () => {
    const inmobi = getNetwork('inmobi');
    expect(inmobi!.format).toBe('html');
    expect(inmobi!.inlineAssets).toBe(true);
  });

  it('snapchat should have config.json with orientation', () => {
    const snapchat = getNetwork('snapchat');
    expect(snapchat!.zipConfig).toBeDefined();
    expect(snapchat!.zipConfig).toHaveProperty('orientation');
  });

  it('MRAID networks should all have mraid=true', () => {
    const mraidIds = ['applovin', 'unity', 'ironsource', 'adcolony', 'appreciate', 'chartboost', 'liftoff', 'mytarget', 'adikteev', 'bigabid', 'inmobi'];
    mraidIds.forEach(id => {
      const n = getNetwork(id);
      expect(n, `${id} should exist`).toBeDefined();
      expect(n!.mraid, `${id} should have mraid=true`).toBe(true);
    });
  });

  it('getAllNetworks should return all networks', () => {
    const all = getAllNetworks();
    expect(all.length).toBe(Object.keys(NETWORKS).length);
  });
});
