/**
 * Hint text stating a custom splash logo's own pixel size.
 *
 * Deliberately free of any `@playbox-ai/playable-kit` import: the panel runs in
 * the editor's renderer and needs only this string, so pulling the packaging
 * engine in for it would load zip/HTML machinery into the UI process.
 */

import { translate, type Lang } from '../i18n/locales';

/**
 * The splash scale is authoritative in both directions — a logo whose intrinsic
 * size is below it gets enlarged, so a small asset can be blown up until it
 * goes soft. Showing the source dimensions next to the slider makes that
 * trade-off visible in the editor instead of on a device.
 *
 * Dimensions come from the panel's <img> once it decodes; `naturalWidth` is 0
 * until then, and NaN if something odd happens, both of which must render as
 * nothing rather than "0×0 px".
 */
export function formatLogoDimensions(width: number, height: number, lang: Lang): string {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return '';
  if (width <= 0 || height <= 0) return '';
  return translate(lang, 'settings.logoNaturalSize')
    .replace('{w}', String(Math.round(width)))
    .replace('{h}', String(Math.round(height)));
}
