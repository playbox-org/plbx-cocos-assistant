import { HtmlBuilder } from '../html-builder';
import { NetworkConfig, PackageConfig } from '../../../shared/types';
import { BaseAdapter } from './base';

const MINTEGRAL_VIEWPORT =
  'width=device-width,user-scalable=no,initial-scale=1.0,minimum-scale=1.0,maximum-scale=1.0';

const MINTEGRAL_LIFECYCLE_SCRIPT = `window.gameReady = function() { if(window.mintGameReady) window.mintGameReady(); };
window.gameStart = function() { if(window.mintGameStart) window.mintGameStart(); };
window.gameClose = function() { if(window.mintGameClose) window.mintGameClose(); };`;

/**
 * Mintegral adapter.
 * - Renames JS bundle to creative.js (handled via networkConfig.jsBundle)
 * - Injects custom viewport meta
 * - Injects game lifecycle bridge functions
 */
export class MintegralAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }

  transform(builder: HtmlBuilder, config: PackageConfig): void {
    super.transform(builder, config);
    builder.injectMeta('viewport', MINTEGRAL_VIEWPORT);
    builder.injectBodyScript(MINTEGRAL_LIFECYCLE_SCRIPT);
  }
}
