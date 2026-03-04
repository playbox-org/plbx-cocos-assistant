import { describe, it, expect } from 'vitest';
import {
  extractVariables,
  getUserVariables,
  resolveTemplate,
  validateTemplate,
  TemplateContext,
} from '../../../src/core/packager/template-resolver';

const baseCtx: TemplateContext = {
  network: 'AppLovin',
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

  it('resolves {network} (display name) correctly', () => {
    expect(resolveTemplate('{network}.{ext}', baseCtx)).toBe('AppLovin.html');
  });
});

describe('extractVariables', () => {
  it('extracts all tokens', () => {
    expect(extractVariables('{networkId}/{version}/index.{ext}')).toEqual([
      'networkId',
      'version',
      'ext',
    ]);
  });

  it('deduplicates repeated tokens', () => {
    expect(extractVariables('{ext}.{ext}')).toEqual(['ext']);
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
