import { HtmlBuilder } from '../html-builder';
import { NetworkConfig, PackageConfig } from '../../../shared/types';
import { BaseAdapter, googleBridge } from './base';

/**
 * Google Ads adapter.
 * - Injects ExitAPI script (via sdkUrl in NetworkConfig)
 * - Injects <meta name="ad-size"> based on orientation: portrait=320x480, landscape=480x320
 * - Injects <meta name="ad-orientation">
 */
export class GoogleAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }

  protected getPlbxBridge(_config: PackageConfig): string {
    return googleBridge();
  }

  transform(builder: HtmlBuilder, config: PackageConfig): void {
    super.transform(builder, config);

    const isLandscape = config.orientation === 'landscape';
    const size = isLandscape ? '480x320' : '320x480';
    const orientationLabel = isLandscape ? 'landscape' : 'portrait';

    builder.injectMeta('ad-size', size);
    builder.injectMeta('ad-orientation', orientationLabel);

    // Inject clickTag variable required by Google Ads Rich Media validator.
    // Must be a `var` declaration (validator pattern-matches for it).
    // Default value is Google's macro; falls back to URL param at runtime.
    const clickTagScript = `var clickTag = "%%CLICK_URL_UNESC%%";\n` +
      `try { var u = new URLSearchParams(window.location.search).get("clickTag"); if (u) clickTag = u; } catch(e) {}`;
    builder.injectBodyScript(clickTagScript);
  }
}
