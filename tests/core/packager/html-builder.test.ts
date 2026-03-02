import { describe, it, expect, beforeAll } from 'vitest';
import { HtmlBuilder } from '../../../src/core/packager/html-builder';
import { readFileSync } from 'fs';
import { join } from 'path';

const SAMPLE_HTML_PATH = join(__dirname, '../../fixtures/sample-build/index.html');
let sampleHtml: string;

beforeAll(() => {
  sampleHtml = readFileSync(SAMPLE_HTML_PATH, 'utf-8');
});

describe('HtmlBuilder', () => {
  it('should parse HTML and find scripts', () => {
    const builder = new HtmlBuilder(sampleHtml);
    const scripts = builder.getScripts();
    expect(scripts).toContain('cocos-js/cc.js');
    expect(scripts).toContain('assets/main.js');
  });

  it('should find stylesheets', () => {
    const builder = new HtmlBuilder(sampleHtml);
    const sheets = builder.getStylesheets();
    expect(sheets).toContain('style.css');
  });

  it('should inject script tag into head', () => {
    const builder = new HtmlBuilder(sampleHtml);
    builder.injectHeadScript('mraid.js');
    const html = builder.toHtml();
    expect(html).toContain('<script src="mraid.js"></script>');
    // Should be in <head>, before other content
    const headContent = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
    expect(headContent).toContain('mraid.js');
  });

  it('should inject meta tag', () => {
    const builder = new HtmlBuilder(sampleHtml);
    builder.injectMeta('ad-size', '320x480');
    const html = builder.toHtml();
    expect(html).toContain('name="ad-size"');
    expect(html).toContain('content="320x480"');
  });

  it('should inject inline script into body', () => {
    const builder = new HtmlBuilder(sampleHtml);
    builder.injectBodyScript('window.gameReady = true;');
    const html = builder.toHtml();
    expect(html).toContain('window.gameReady = true;');
  });

  it('should replace script src', () => {
    const builder = new HtmlBuilder(sampleHtml);
    const replaced = builder.replaceScriptSrc('assets/main.js', 'creative.js');
    expect(replaced).toBe(true);
    const html = builder.toHtml();
    expect(html).toContain('creative.js');
    expect(html).not.toContain('assets/main.js');
  });

  it('should return false when replacing non-existent script', () => {
    const builder = new HtmlBuilder(sampleHtml);
    const replaced = builder.replaceScriptSrc('nonexistent.js', 'new.js');
    expect(replaced).toBe(false);
  });

  it('should inline CSS content replacing link tag', () => {
    const builder = new HtmlBuilder(sampleHtml);
    builder.inlineCss('style.css', '.game { color: red; }');
    const html = builder.toHtml();
    expect(html).not.toContain('href="style.css"');
    expect(html).toContain('.game { color: red; }');
  });

  it('should inline JS content replacing script src', () => {
    const builder = new HtmlBuilder(sampleHtml);
    builder.inlineScript('assets/main.js', 'var game = {};');
    const html = builder.toHtml();
    expect(html).not.toContain('src="assets/main.js"');
    expect(html).toContain('var game = {};');
  });

  it('should minify inline CSS', () => {
    const builder = new HtmlBuilder(sampleHtml);
    const beforeHtml = builder.toHtml();
    builder.minifyCss();
    const afterHtml = builder.toHtml();
    // Minified should be shorter or equal
    expect(afterHtml.length).toBeLessThanOrEqual(beforeHtml.length);
  });

  it('should set title', () => {
    const builder = new HtmlBuilder(sampleHtml);
    builder.setTitle('My Playable Ad');
    expect(builder.toHtml()).toContain('<title>My Playable Ad</title>');
  });
});
