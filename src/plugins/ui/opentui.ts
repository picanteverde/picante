import type { CliUIPlugin, Config } from '../types.ts';
import { PROVIDERS } from '../../providers/index.ts';

function detectProvider(baseUrl: string): string {
  for (const [name, p] of Object.entries(PROVIDERS)) {
    try {
      if (baseUrl.includes(new URL(p.baseUrl).hostname)) return name;
    } catch { /* ignore */ }
  }
  try {
    return new URL(baseUrl).hostname.replace(/^www\./, '').split('.')[0] ?? baseUrl;
  } catch {
    return baseUrl;
  }
}

export class OpenTUIPlugin implements CliUIPlugin {
  private readonly _provider: string;
  private readonly _model: string;
  private _sessionId = '';
  private _version = '';

  private _initPromise: Promise<void> | null = null;
  private _renderer: any = null;
  private _statusEl: any = null;
  private _msgsEl: any = null;
  private _scrollBox: any = null;
  private _inputEl: any = null;

  private _inputBuf = '';
  private _msgLines: string[] = [];
  private _msgsMaxLines = 20;
  private _lineResolvers: Array<(s: string | null) => void> = [];

  constructor(config: Config) {
    this._provider = detectProvider(config.baseUrl);
    this._model = config.model;
  }

  private _ensureInit(): Promise<void> {
    if (!this._initPromise) this._initPromise = this._setup();
    return this._initPromise;
  }

  private async _setup(): Promise<void> {
    const { createCliRenderer, BoxRenderable, TextRenderable, ScrollBoxRenderable } = await import('@opentui/core') as any;

    const W = process.stdout.columns || 80;
    const H = process.stdout.rows || 24;
    const STATUS_H = 3;
    const INPUT_H = 3;
    const MSGS_H = Math.max(H - STATUS_H - INPUT_H, 4);
    this._msgsMaxLines = Math.max(MSGS_H * 3, 60); // buffer more lines since scroll box handles display

    const renderer = await createCliRenderer({ exitOnCtrlC: false });
    this._renderer = renderer;

    // Root column wrapper
    const rootBox = new BoxRenderable(renderer, {
      width: W,
      height: H,
      flexDirection: 'column',
      backgroundColor: '#0e0e1a',
    });

    // ── Status bar ──────────────────────────────────────────────
    const statusBox = new BoxRenderable(renderer, {
      width: W,
      height: STATUS_H,
      backgroundColor: '#16213e',
      alignItems: 'center',
      padding: 1,
    });
    const statusEl = new TextRenderable(renderer, {
      content: this._buildStatusLine(),
      fg: '#a8b8d8',
    });
    this._statusEl = statusEl;
    statusBox.add(statusEl);

    // ── Messages area (scrollable) ──────────────────────────────
    const scrollBox = new ScrollBoxRenderable(renderer, {
      width: W,
      height: MSGS_H,
      backgroundColor: '#0e0e1a',
      padding: 1,
    });
    const msgsEl = new TextRenderable(renderer, {
      content: '',
      fg: '#d4d4e8',
    });
    this._msgsEl = msgsEl;
    scrollBox.add(msgsEl);
    this._scrollBox = scrollBox;

    // ── Input line ──────────────────────────────────────────────
    const inputBox = new BoxRenderable(renderer, {
      width: W,
      height: INPUT_H,
      backgroundColor: '#111128',
      alignItems: 'center',
      padding: 1,
    });
    const inputEl = new TextRenderable(renderer, {
      content: '> _',
      fg: '#f0f0ff',
    });
    this._inputEl = inputEl;
    inputBox.add(inputEl);

    rootBox.add(statusBox);
    rootBox.add(scrollBox);
    rootBox.add(inputBox);
    renderer.root.add(rootBox);

    // ── Keyboard handler ────────────────────────────────────────
    renderer.keyInput.on('keypress', (key: any) => {
      if (key.name === 'return' || key.name === 'enter') {
        const line = this._inputBuf;
        this._inputBuf = '';
        this._refreshInput();
        if (line.trim()) this._addLine(`> ${line}`);
        const resolve = this._lineResolvers.shift();
        if (resolve) resolve(line);
      } else if (key.name === 'backspace') {
        this._inputBuf = this._inputBuf.slice(0, -1);
        this._refreshInput();
      } else if (key.ctrl && key.name === 'd') {
        const resolve = this._lineResolvers.shift();
        if (resolve) resolve(null);
      } else if (key.ctrl && key.name === 'c') {
        renderer.destroy();
        process.exit(0);
      } else if (key.sequence && !key.ctrl && !key.meta && key.sequence.length === 1) {
        this._inputBuf += key.sequence;
        this._refreshInput();
      }
    });
  }

  private _buildStatusLine(): string {
    const parts = [`🌶 picante${this._version ? ` v${this._version}` : ''}`];
    parts.push(`  │  ${this._provider}`);
    parts.push(`  │  ${this._model || '(no model)'}`);
    if (this._sessionId) parts.push(`  │  ${this._sessionId.slice(0, 8)}`);
    return parts.join('');
  }

  private _refreshInput(): void {
    if (this._inputEl) this._inputEl.content = `> ${this._inputBuf}_`;
  }

  private _addLine(text: string): void {
    for (const l of text.split('\n')) this._msgLines.push(l);
    if (this._msgLines.length > 500) this._msgLines = this._msgLines.slice(-500);
    if (this._msgsEl) {
      this._msgsEl.content = this._msgLines.slice(-this._msgsMaxLines).join('\n');
      // Scroll to bottom so newest content is always visible
      try { this._scrollBox?.scrollToBottom?.(); } catch { /* ignore */ }
    }
  }

  // ── UIPlugin ────────────────────────────────────────────────

  showHeader(sessionId: string, version: string): void {
    this._sessionId = sessionId;
    this._version = version;
    void this._ensureInit().then(() => {
      if (this._statusEl) this._statusEl.content = this._buildStatusLine();
    });
  }

  onText(text: string): void {
    this._addLine(text.trim());
  }

  onToolCall(name: string, args: Record<string, unknown>): void {
    const s = JSON.stringify(args);
    this._addLine(`  ⚙ ${name}(${s.length > 60 ? s.slice(0, 57) + '...' : s})`);
  }

  onToolResult(_name: string, result: string): void {
    const preview = (result.split('\n')[0] ?? '').slice(0, 60);
    this._addLine(`  → ${preview}${result.length > 60 ? '...' : ''}`);
  }

  async promptUser(question: string): Promise<string> {
    await this._ensureInit();
    this._addLine(`? ${question}`);
    return new Promise(resolve => {
      this._lineResolvers.push(s => resolve(s ?? ''));
    });
  }

  // ── CliUIPlugin ─────────────────────────────────────────────

  async *lines(): AsyncGenerator<string> {
    await this._ensureInit();
    while (true) {
      const line = await new Promise<string | null>(resolve => {
        this._lineResolvers.push(resolve);
      });
      if (line === null) break;
      yield line;
    }
    this._renderer?.destroy();
  }
}
