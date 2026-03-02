import * as cheerio from 'cheerio';
import CleanCSS from 'clean-css';

export class HtmlBuilder {
  private $: cheerio.CheerioAPI;

  constructor(html: string) {
    this.$ = cheerio.load(html, { decodeEntities: false } as any);
  }

  /** Get all <script> tags with src attribute */
  getScripts(): string[] {
    const scripts: string[] = [];
    this.$('script[src]').each((_, el) => {
      const src = this.$(el).attr('src');
      if (src) scripts.push(src);
    });
    return scripts;
  }

  /** Get all <link rel="stylesheet"> hrefs */
  getStylesheets(): string[] {
    const links: string[] = [];
    this.$('link[rel="stylesheet"]').each((_, el) => {
      const href = this.$(el).attr('href');
      if (href) links.push(href);
    });
    return links;
  }

  /** Inject a <script src="..."> tag as the FIRST child of <head> */
  injectHeadScript(src: string): void {
    this.$('head').prepend(`<script src="${src}"></script>\n`);
  }

  /** Inject inline <script> at the end of <body> */
  injectBodyScript(code: string): void {
    this.$('body').append(`<script>${code}</script>\n`);
  }

  /** Inject a <meta> tag into <head> */
  injectMeta(name: string, content: string): void {
    this.$('head').append(`<meta name="${name}" content="${content}">\n`);
  }

  /** Replace a script src with a new src */
  replaceScriptSrc(oldSrc: string, newSrc: string): boolean {
    const script = this.$(`script[src="${oldSrc}"]`);
    if (script.length === 0) return false;
    script.attr('src', newSrc);
    return true;
  }

  /** Inline a CSS file content into a <style> tag, replacing the <link> */
  inlineCss(href: string, cssContent: string): void {
    const link = this.$(`link[href="${href}"]`);
    if (link.length > 0) {
      link.replaceWith(`<style>${cssContent}</style>`);
    }
  }

  /** Inline a JS file content, replacing the <script src> */
  inlineScript(src: string, jsContent: string): void {
    const script = this.$(`script[src="${src}"]`);
    if (script.length > 0) {
      script.removeAttr('src');
      script.html(jsContent);
    }
  }

  /** Minify all inline <style> blocks using clean-css */
  minifyCss(): void {
    const cleanCss = new CleanCSS({ level: 2 });
    this.$('style').each((_, el) => {
      const style = this.$(el);
      const original = style.html();
      if (original) {
        const minified = cleanCss.minify(original);
        if (minified.styles) {
          style.html(minified.styles);
        }
      }
    });
  }

  /** Set the <title> */
  setTitle(title: string): void {
    this.$('title').text(title);
  }

  /** Get the final HTML string */
  toHtml(): string {
    return this.$.html();
  }
}
