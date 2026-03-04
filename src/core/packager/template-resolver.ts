/**
 * Template resolver for output file naming.
 *
 * Templates use `{token}` placeholders. System variables are:
 *   network, networkId, format, ext
 * Everything else is a user-defined variable supplied via templateVariables.
 *
 * Security: rejects `..`, absolute paths, and null bytes.
 */

export interface TemplateContext {
  network: string;
  networkId: string;
  format: string;
  ext: string;
  [key: string]: string;
}

const SYSTEM_VARS = new Set(['network', 'networkId', 'format', 'ext']);

const TOKEN_RE = /\{(\w+)\}/g;

/** Extract all `{token}` variable names from a template string. */
export function extractVariables(template: string): string[] {
  const vars: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(template)) !== null) {
    if (!vars.includes(m[1])) vars.push(m[1]);
  }
  return vars;
}

/** Return only user-defined variable names (exclude system vars). */
export function getUserVariables(template: string): string[] {
  return extractVariables(template).filter(v => !SYSTEM_VARS.has(v));
}

/** Replace `{token}` placeholders with values from context. */
export function resolveTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(TOKEN_RE, (match, key) => {
    return key in ctx ? ctx[key] : match;
  });
}

/** Validate a template string. Returns `{ valid: true }` or `{ valid: false, error }`. */
export function validateTemplate(template: string): { valid: boolean; error?: string } {
  if (!template || !template.trim()) {
    return { valid: false, error: 'Template must not be empty' };
  }

  if (!template.includes('{ext}')) {
    return { valid: false, error: 'Template must contain {ext} placeholder' };
  }

  if (template.includes('..')) {
    return { valid: false, error: 'Template must not contain path traversal (..)' };
  }

  if (/^[/\\]/.test(template) || /^[a-zA-Z]:/.test(template)) {
    return { valid: false, error: 'Template must not be an absolute path' };
  }

  if (template.includes('\0')) {
    return { valid: false, error: 'Template must not contain null bytes' };
  }

  return { valid: true };
}
