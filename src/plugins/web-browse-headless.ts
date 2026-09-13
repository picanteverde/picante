import { load } from 'cheerio';
import type { Tool } from '../agent.ts';

// Headless Chromium browser via puppeteer — executes JS, handles SPAs.
// Requires puppeteer: bun add puppeteer
export const webBrowseHeadlessTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'web_browse_headless',
      description: 'Fetch a URL using a headless Chromium browser that executes JavaScript. Use for SPAs, dynamic content, or pages that require JS. Slower than web_browse.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch.' },
          selector: { type: 'string', description: 'Optional CSS selector to extract specific content.' },
          wait_for: { type: 'string', description: 'Optional CSS selector to wait for before extracting.' },
        },
        required: ['url'],
      },
    },
  },
  execute: async ({ url, selector, wait_for }: { url: string; selector?: string; wait_for?: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let puppeteer: any;
    try {
      // @ts-ignore — optional dependency, installed separately
      puppeteer = await import('puppeteer');
    } catch {
      return 'Error: puppeteer not installed. Run: bun add puppeteer';
    }
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (compatible; picante-agent/1.0)');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
      if (wait_for) await page.waitForSelector(wait_for, { timeout: 10_000 }).catch(() => {});
      const html = await page.content();
      const $ = load(html);
      $('script, style, nav, footer, header').remove();
      const root = selector ? $(selector) : $('main, article, [role=main], body');
      const text = root.text().replace(/\s{3,}/g, '\n\n').trim();
      return text.slice(0, 8000) + (text.length > 8000 ? '\n\n[truncated]' : '');
    } finally {
      await browser.close();
    }
  },
};
