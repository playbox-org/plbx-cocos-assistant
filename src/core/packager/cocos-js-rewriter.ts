/**
 * Text-rewriter для cocos-js/*.js файлов перед инлайнингом в HTML.
 *
 * Зачем: emscripten wasm/asm loader'ы (spine, box2d, physx, dragonbones) читают
 * base URL через `document.currentScript.src` и резолвят .mem/.wasm через
 * `new URL(memName, baseURL)`. В embedded-loader сценарии (runtime из ZIP):
 *   - document.currentScript === null  → baseURL = ""
 *   - default-экспорт спутника со строкой пути иногда приходит undefined
 *     → new URL(undefined, base) → href = "<base>/undefined" → fetch 404.
 *
 * Подход super-html: на этапе билда переписываем критические идиомы в JS
 * на наши обёртки, которые знают про in-memory ZIP. См. /Playables/super-html/.
 */

/** Применять переписку только к этим путям (относительно buildDir). */
export function shouldRewriteCocosJs(relativePath: string): boolean {
  const norm = relativePath.replace(/\\/g, '/');
  return norm.startsWith('cocos-js/') && norm.endsWith('.js');
}

/**
 * Переписать содержимое одного JS-файла. Идиомы:
 *   - `new URL`                   → `new (window._PLBX_URL||URL)`
 *   - `document.currentScript`    → `(window._PLBX_currentScript||document.currentScript)`
 *
 * Для self-contained loader (FB-safe, как super-html) дополнительно:
 *   - `XMLHttpRequest`            → `_XMLLocalRequest`  (движок грузит из кеша, без
 *                                   реального XHR — Facebook блокирует/переписывает
 *                                   литерал XMLHttpRequest → _xrq_). `getXMLHttpRequest`
 *                                   (имя метода) НЕ трогаем — нет \b-границы.
 *   - `X.createElement("script")` → `_createLocalJSElement()`  (bundle-скрипты
 *                                   eval'ятся из кеша, без реального <script> —
 *                                   Facebook блокирует динамическую загрузку,
 *                                   defineProperty на src реального <script> падает).
 *
 * Замены текстовые. Это безопасно для авто-сгенерированных Rollup-чанков
 * Cocos — там идиомы стабильные, нет хитрого ESM-парсинга в строках.
 */
export function rewriteCocosJs(content: string, opts?: { selfContained?: boolean }): string {
  let out = content;
  out = out.replace(/\bnew URL\b/g, 'new (window._PLBX_URL||URL)');
  out = out.replace(
    /\bdocument\.currentScript\b/g,
    '(window._PLBX_currentScript||document.currentScript)',
  );
  if (opts?.selfContained) {
    out = rewriteForFacebookSafe(out);
  }
  return out;
}

/**
 * FB-safe token rewrite applied to ANY inlined script (cc.js bundles AND the
 * inlined system.bundle.js / boot scripts in generateFullHtml). Facebook blocks
 * dynamic `<script>` loading and rewrites the `XMLHttpRequest` literal → _xrq_,
 * so even the engine/SystemJS *source* must not contain them. The self-contained
 * loader provides window._XMLLocalRequest / window._createLocalJSElement.
 *
 * Note: `fetch` is intentionally NOT rewritten — super-html keeps it (FB allows
 * a window.fetch override), and `getXMLHttpRequest` (method name) is preserved
 * by the \b word-boundary.
 */
export function rewriteForFacebookSafe(content: string): string {
  let out = content;
  out = out.replace(/\bXMLHttpRequest\b/g, '_XMLLocalRequest');
  out = out.replace(/(?:[\w$]+\.)?createElement\((["'])script\1\)/g, '_createLocalJSElement()');
  return out;
}
