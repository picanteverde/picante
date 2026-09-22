import { describe, it, expect, spyOn, afterEach, beforeEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { webSearchTool } from './web-search.ts';
import { webBrowseTool } from './web-browse.ts';
import { webDownloadTool } from './web-download.ts';
import { webBrowseHeadlessTool } from './web-browse-headless.ts';

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>> | null = null;
function mockFetch(opts: { ok?: boolean; status?: number; text?: string; contentType?: string; bytes?: Uint8Array }) {
  fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: new Headers(opts.contentType ? { 'content-type': opts.contentType } : {}),
    text: async () => opts.text ?? '',
    arrayBuffer: async () => (opts.bytes ?? new Uint8Array()).buffer,
  } as unknown as Response);
  return fetchSpy;
}
afterEach(() => { fetchSpy?.mockRestore(); fetchSpy = null; });

const ddgHtml = (n: number) => `<html><body>${Array.from({ length: n }, (_, i) => `
  <div class="result__body">
    <a class="result__title">Title ${i + 1}</a>
    <a class="result__url"> example${i + 1}.com </a>
    <div class="result__snippet">Snippet ${i + 1}</div>
  </div>`).join('')}</body></html>`;

describe('web_search tool', () => {
  it('queries DuckDuckGo with the encoded query and a user agent', async () => {
    mockFetch({ text: ddgHtml(1) });
    await webSearchTool.execute({ query: 'a b&c' });
    const [url, init] = fetchSpy!.mock.calls[0]!;
    expect(url).toBe('https://html.duckduckgo.com/html/?q=a%20b%26c');
    expect((init as RequestInit).headers).toHaveProperty('User-Agent');
  });

  it('formats title, url and snippet for each result', async () => {
    mockFetch({ text: ddgHtml(2) });
    const out = await webSearchTool.execute({ query: 'x' });
    expect(out).toContain('**Title 1**\nexample1.com\nSnippet 1');
    expect(out).toContain('**Title 2**');
  });

  it('defaults to 5 results and caps count at 20', async () => {
    mockFetch({ text: ddgHtml(30) });
    expect((await webSearchTool.execute({ query: 'x' })).match(/\*\*Title/g)).toHaveLength(5);
    expect((await webSearchTool.execute({ query: 'x', count: 2 })).match(/\*\*Title/g)).toHaveLength(2);
    expect((await webSearchTool.execute({ query: 'x', count: 99 })).match(/\*\*Title/g)).toHaveLength(20);
  });

  it('skips results without a title', async () => {
    mockFetch({ text: '<div class="result__body"><div class="result__snippet">s</div></div>' });
    expect(await webSearchTool.execute({ query: 'x' })).toBe('No results found.');
  });

  it('reports HTTP failures', async () => {
    mockFetch({ ok: false, status: 429 });
    expect(await webSearchTool.execute({ query: 'x' })).toBe('Search failed: HTTP 429');
  });
});

describe('web_browse tool', () => {
  it('returns raw text for non-HTML responses', async () => {
    mockFetch({ text: '{"a":1}', contentType: 'application/json' });
    expect(await webBrowseTool.execute({ url: 'https://x/api' })).toBe('{"a":1}');
  });

  it('strips script/style/nav/header/footer and returns readable text', async () => {
    mockFetch({
      contentType: 'text/html',
      text: '<html><head><style>.a{}</style></head><body><nav>NAV</nav><header>HEAD</header><main><h1>Hello</h1><script>evil()</script><p>World</p></main><footer>FOOT</footer></body></html>',
    });
    const out = await webBrowseTool.execute({ url: 'https://x' });
    expect(out).toContain('Hello');
    expect(out).toContain('World');
    for (const junk of ['NAV', 'HEAD', 'FOOT', 'evil', '.a{}']) expect(out).not.toContain(junk);
  });

  it('extracts only the selector when given', async () => {
    mockFetch({ contentType: 'text/html', text: '<body><p id="a">A</p><p id="b">B</p></body>' });
    expect(await webBrowseTool.execute({ url: 'https://x', selector: '#b' })).toBe('B');
  });

  it('truncates output at 8000 characters', async () => {
    mockFetch({ contentType: 'text/html', text: `<body><p>${'x'.repeat(9000)}</p></body>` });
    const out = await webBrowseTool.execute({ url: 'https://x' });
    expect(out.endsWith('[truncated]')).toBe(true);
    expect(out.length).toBeLessThan(8100);
  });

  it('reports HTTP failures', async () => {
    mockFetch({ ok: false, status: 404 });
    expect(await webBrowseTool.execute({ url: 'https://x' })).toBe('Fetch failed: HTTP 404');
  });
});

describe('web_download tool', () => {
  let tmp: string; let cwd: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'picante-dl-')); cwd = process.cwd(); process.chdir(tmp); });
  afterEach(() => { process.chdir(cwd); rmSync(tmp, { recursive: true, force: true }); });

  it('saves to the given path, creating parent directories', async () => {
    mockFetch({ bytes: new TextEncoder().encode('abc') });
    const out = await webDownloadTool.execute({ url: 'https://x/f.bin', path: join(tmp, 'out', 'f.bin') });
    expect(readFileSync(join(tmp, 'out', 'f.bin'), 'utf8')).toBe('abc');
    expect(out).toBe(`Downloaded 3 bytes to ${join(tmp, 'out', 'f.bin')}`);
  });

  it('derives the filename from the URL when no path is given', async () => {
    mockFetch({ bytes: new Uint8Array([1, 2]) });
    const out = await webDownloadTool.execute({ url: 'https://x/dir/report.pdf?v=1' });
    expect(out).toBe('Downloaded 2 bytes to report.pdf');
    expect(existsSync(join(tmp, 'report.pdf'))).toBe(true);
  });

  it('falls back to "download" when the URL has no filename', async () => {
    mockFetch({ bytes: new Uint8Array([1]) });
    expect(await webDownloadTool.execute({ url: 'https://x/' })).toBe('Downloaded 1 bytes to download');
  });

  it('reports HTTP failures without writing', async () => {
    mockFetch({ ok: false, status: 500 });
    expect(await webDownloadTool.execute({ url: 'https://x/f', path: join(tmp, 'f') })).toBe('Download failed: HTTP 500');
    expect(existsSync(join(tmp, 'f'))).toBe(false);
  });
});

describe('web_browse_headless tool', () => {
  it('returns an install hint when puppeteer is not available', async () => {
    const out = await webBrowseHeadlessTool.execute({ url: 'https://x' });
    expect(out).toBe('Error: puppeteer not installed. Run: bun add puppeteer');
  });
});
