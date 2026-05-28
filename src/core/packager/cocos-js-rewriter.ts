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
 * Замены текстовые. Это безопасно для авто-сгенерированных Rollup-чанков
 * Cocos — там идиомы стабильные, нет хитрого ESM-парсинга в строках.
 */
export function rewriteCocosJs(content: string): string {
  let out = content;
  out = out.replace(/\bnew URL\b/g, 'new (window._PLBX_URL||URL)');
  out = out.replace(
    /\bdocument\.currentScript\b/g,
    '(window._PLBX_currentScript||document.currentScript)',
  );
  return out;
}
