/**
 * Template resolver for output file naming.
 *
 * Templates use `{token}` placeholders. System variables are:
 *   network, networkId, format, ext
 * Everything else is a user-defined variable supplied via templateVariables.
 *
 * Case convention: the casing of the first letter controls output casing.
 *   {network}   → "applovin"   (lowercase)
 *   {Network}   → "Applovin"   (capitalized)
 *   {NETWORK}   → "APPLOVIN"   (uppercase)
 *   {networkId} → "applovin"   (lowercase)
 *   {NetworkId} → "Applovin"   (capitalized)
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

/** Normalize a variable key to its lowercase context key. */
function toContextKey(key: string): string {
  // All uppercase: "NETWORK" → "network", "EXT" → "ext"
  if (key === key.toUpperCase()) return key.toLowerCase();
  // PascalCase/Capitalized: "Network" → "network", "NetworkId" → "networkId"
  return key[0].toLowerCase() + key.slice(1);
}

/** Apply casing convention based on the variable name. */
function applyCasing(key: string, value: string): string {
  if (!value) return value;
  // All uppercase variable name → UPPERCASE value
  if (key === key.toUpperCase() && key.length > 1) return value.toUpperCase();
  // First letter uppercase → Capitalize first letter, rest lowercase
  if (key[0] === key[0].toUpperCase() && key[0] !== key[0].toLowerCase()) {
    return value[0].toUpperCase() + value.slice(1).toLowerCase();
  }
  // Lowercase → lowercase value
  return value.toLowerCase();
}

/** Extract all `{token}` variable names from a template string (normalized to lowercase context keys). */
export function extractVariables(template: string): string[] {
  const vars: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(template)) !== null) {
    const normalized = toContextKey(m[1]);
    if (!vars.includes(normalized)) vars.push(normalized);
  }
  return vars;
}

/** Return only user-defined variable names (exclude system vars). */
export function getUserVariables(template: string): string[] {
  return extractVariables(template).filter(v => !SYSTEM_VARS.has(v));
}

/** Replace `{token}` placeholders with values from context, applying casing convention. */
export function resolveTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(TOKEN_RE, (match, key) => {
    const ctxKey = toContextKey(key);
    if (ctxKey in ctx) return applyCasing(key, ctx[ctxKey]);
    // Try exact key for user vars
    if (key in ctx) return ctx[key];
    return match;
  });
}

/** Validate a template string. Returns `{ valid: true }` or `{ valid: false, error }`. */
export function validateTemplate(template: string): { valid: boolean; error?: string } {
  if (!template || !template.trim()) {
    return { valid: false, error: 'Template must not be empty' };
  }

  if (!/\{[eE][xX][tT]\}/.test(template)) {
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
