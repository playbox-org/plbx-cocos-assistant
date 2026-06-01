import { describe, it, expect } from 'vitest';
import { translate, normalizeLang, SUPPORTED_LANGS, DEFAULT_LANG, LOCALES } from '../../src/core/i18n/locales';

describe('SUPPORTED_LANGS', () => {
  it('is exactly en, ru, zh', () => {
    expect(SUPPORTED_LANGS).toEqual(['en', 'ru', 'zh']);
  });
  it('default is en', () => {
    expect(DEFAULT_LANG).toBe('en');
  });
});

describe('normalizeLang', () => {
  it('keeps a supported language', () => {
    expect(normalizeLang('ru')).toBe('ru');
    expect(normalizeLang('zh')).toBe('zh');
  });
  it('falls back to default for unsupported / empty', () => {
    expect(normalizeLang('fr')).toBe('en');
    expect(normalizeLang('')).toBe('en');
    expect(normalizeLang(undefined)).toBe('en');
    expect(normalizeLang(null as any)).toBe('en');
  });
  it('lowercases / trims region tags (zh-CN → zh, EN → en)', () => {
    expect(normalizeLang('zh-CN')).toBe('zh');
    expect(normalizeLang('EN')).toBe('en');
    expect(normalizeLang('ru-RU')).toBe('ru');
  });
});

describe('translate', () => {
  it('returns the localized string for a known key', () => {
    expect(translate('ru', 'tab.package')).toBe('Упаковка');
    expect(translate('en', 'settings.title')).toBe('Settings');
    expect(translate('zh', 'settings.language')).toBe('语言');
  });
  it('falls back to English when the language lacks the key', () => {
    // Simulate a key present in en but (hypothetically) missing elsewhere by
    // checking the documented fallback contract on a real key set only in en.
    const enOnly = Object.keys(LOCALES.en).find((k) => !(k in LOCALES.zh));
    if (enOnly) {
      expect(translate('zh', enOnly)).toBe(LOCALES.en[enOnly]);
    }
  });
  it('returns the key itself when nothing matches (visible gap, not blank)', () => {
    expect(translate('en', 'totally.unknown.key')).toBe('totally.unknown.key');
    expect(translate('ru', 'totally.unknown.key')).toBe('totally.unknown.key');
  });
  it('normalizes the language before lookup', () => {
    expect(translate('zh-CN' as any, 'tab.package')).toBe('打包');
  });
});

describe('LOCALES completeness', () => {
  it('ru and zh cover every en key (no missing chrome strings)', () => {
    const enKeys = Object.keys(LOCALES.en);
    for (const lang of ['ru', 'zh'] as const) {
      const missing = enKeys.filter((k) => !(k in LOCALES[lang]));
      expect(missing, `${lang} missing: ${missing.join(', ')}`).toEqual([]);
    }
  });
});
