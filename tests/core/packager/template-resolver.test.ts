import { describe, it, expect } from 'vitest';
import {
  extractVariables,
  getUserVariables,
  resolveTemplate,
  validateTemplate,
  TemplateContext,
} from '../../../src/core/packager/template-resolver';

const baseCtx: TemplateContext = {
  network: 'applovin',
  networkId: 'applovin',
  format: 'html',
  ext: 'html',
};

describe('resolveTemplate', () => {
  it('resolves system variables only', () => {
    expect(resolveTemplate('{networkId}/index.{ext}', baseCtx)).toBe('applovin/index.html');
  });

  it('resolves user-defined variables', () => {
    const ctx: TemplateContext = { ...baseCtx, version: '2', lang: 'en' };
    expect(resolveTemplate('{networkId}/{version}/{lang}.{ext}', ctx)).toBe('applovin/2/en.html');
  });

  it('leaves unknown tokens untouched', () => {
    expect(resolveTemplate('{networkId}/{unknown}.{ext}', baseCtx)).toBe('applovin/{unknown}.html');
  });

  it('handles nested paths', () => {
    expect(resolveTemplate('a/b/c.{ext}', baseCtx)).toBe('a/b/c.html');
  });

  it('default template produces backward-compatible output', () => {
    const defaultTemplate = '{networkId}/index.{ext}';
    expect(resolveTemplate(defaultTemplate, baseCtx)).toBe('applovin/index.html');

    const zipCtx: TemplateContext = { ...baseCtx, format: 'zip', ext: 'zip' };
    expect(resolveTemplate(defaultTemplate, zipCtx)).toBe('applovin/index.zip');
  });

  // --- Case convention tests ---
  it('{network} (lowercase) → lowercase value', () => {
    expect(resolveTemplate('{network}.{ext}', baseCtx)).toBe('applovin.html');
  });

  it('{Network} (capitalized) → Capitalized value', () => {
    expect(resolveTemplate('{Network}.{ext}', baseCtx)).toBe('Applovin.html');
  });

  it('{NETWORK} (all caps) → UPPERCASE value', () => {
    expect(resolveTemplate('{NETWORK}.{ext}', baseCtx)).toBe('APPLOVIN.html');
  });

  it('{NetworkId} (capitalized) → Capitalized value', () => {
    expect(resolveTemplate('{NetworkId}/index.{ext}', baseCtx)).toBe('Applovin/index.html');
  });

  it('{EXT} (all caps) → HTML uppercase', () => {
    expect(resolveTemplate('{networkId}.{EXT}', baseCtx)).toBe('applovin.HTML');
  });

  it('mixed casing in one template', () => {
    const ctx: TemplateContext = { ...baseCtx, network: 'ironsource', networkId: 'ironsource' };
    expect(resolveTemplate('{networkId}/TRM_{Network}.{ext}', ctx))
      .toBe('ironsource/TRM_Ironsource.html');
  });

  it('user-defined vars also support casing', () => {
    const ctx: TemplateContext = { ...baseCtx, project: 'myGame' };
    expect(resolveTemplate('{Project}_{network}.{ext}', ctx)).toBe('Mygame_applovin.html');
  });
});

describe('extractVariables', () => {
  it('extracts all tokens (normalized to lowercase context keys)', () => {
    expect(extractVariables('{networkId}/{version}/index.{ext}')).toEqual([
      'networkId',
      'version',
      'ext',
    ]);
  });

  it('deduplicates repeated tokens', () => {
    expect(extractVariables('{ext}.{ext}')).toEqual(['ext']);
  });

  it('normalizes casing: {Network} and {network} are the same var', () => {
    expect(extractVariables('{Network}/{network}.{ext}')).toEqual(['network', 'ext']);
  });

  it('returns empty array for no tokens', () => {
    expect(extractVariables('plain.html')).toEqual([]);
  });
});

describe('getUserVariables', () => {
  it('filters out system vars', () => {
    expect(getUserVariables('{networkId}/{version}/{lang}.{ext}')).toEqual(['version', 'lang']);
  });

  it('returns empty when only system vars present', () => {
    expect(getUserVariables('{networkId}/index.{ext}')).toEqual([]);
  });

  it('filters system vars even when capitalized', () => {
    expect(getUserVariables('{Network}/{Version}.{EXT}')).toEqual(['version']);
  });
});

describe('validateTemplate', () => {
  it('accepts valid template', () => {
    expect(validateTemplate('{networkId}/index.{ext}')).toEqual({ valid: true });
  });

  it('rejects empty string', () => {
    const r = validateTemplate('');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('empty');
  });

  it('rejects whitespace-only string', () => {
    expect(validateTemplate('   ').valid).toBe(false);
  });

  it('rejects template without {ext}', () => {
    const r = validateTemplate('{networkId}/index.html');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('{ext}');
  });

  it('rejects path traversal with ..', () => {
    const r = validateTemplate('../{networkId}/index.{ext}');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('..');
  });

  it('rejects absolute path (unix)', () => {
    const r = validateTemplate('/tmp/{networkId}/index.{ext}');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('absolute');
  });

  it('rejects absolute path (windows)', () => {
    const r = validateTemplate('C:\\out\\{networkId}.{ext}');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('absolute');
  });

  it('rejects null bytes', () => {
    const r = validateTemplate('{networkId}\0.{ext}');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('null');
  });
});
