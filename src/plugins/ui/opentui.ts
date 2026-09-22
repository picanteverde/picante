import { homedir } from 'os';
import type { CliUIPlugin, Config, SelectChoice, StatusInfo } from '../types.ts';
import { detectProvider } from '../../providers/index.ts';
import { TUIPlugin } from './tui.ts';

// Full-screen terminal UI built on @opentui/core.
//
//   ┌ 🌶 picante v0.3.2                                   session 2026-09-… ┐
//   │ transcript (scrolls, sticks to bottom)                                │
//   ├───────────────────────────────────────────────────────────────────────┤
//   │ 🌶 type here…                                                         │
//   │ openrouter · google/gemini-flash-1.5  │  ~/proj  │  2026-09-22T21-…   │
//   │ Enter send · ↑↓ history · Ctrl+O model · Ctrl+P provider · /help      │
//   └───────────────────────────────────────────────────────────────────────┘
//
// When the native library is unavailable (cross-compiled binaries, no TTY)
// every call is delegated to the plain TUIPlugin, so behaviour degrades to a
// readline REPL with a numbered picker instead of failing.

const C = {
  bg: '#0f1117',
  panel: '#161a24',
  border: '#2a3040',
  text: '#d6dae3',
  dim: '#6b7280',
  chili: '#e5533d',
  amber: '#f5b642',
  green: '#4ade80',
  user: '#f9fafb',
  selected: '#2b3242',
};

type Resolver = (line: string | null) => void;

export class OpenTUIPlugin implements CliUIPlugin {
  private status: StatusInfo & { version: string } = { provider: '', model: '', sessionId: '', version: '' };

  private initPromise: Promise<void> | null = null;
  private fallback: TUIPlugin | null = null;

  // OpenTUI objects — typed loosely because the module is loaded dynamically.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  private tui: any = null;
  private renderer: any = null;
  private transcript: any = null;
  private input: any = null;
  private headerEl: any = null;
  private statusEl: any = null;
  private overlay: { box: any; list: any; filter: any; choices: SelectChoice[]; resolve: (v: string | null) => void } | null = null;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  private pendingLines: string[] = [];
  private lineResolvers: Resolver[] = [];
  private history: string[] = [];
  private historyIndex = -1;
  private draft = '';
  // Set while promptUser() is waiting: its answer bypasses history and, for
  // secrets, the transcript echo.
  private pendingQuestion: { secret: boolean } | null = null;

  constructor(config?: Config) {
    if (config) {
      this.status.provider = detectProvider(config.baseUrl);
      this.status.model = config.model;
    }
  }

  // ── Setup ─────────────────────────────────────────────────────────────

  private ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.setup().catch(() => { this.setupFallback(); });
    }
    return this.initPromise;
  }

  private setupFallback(): void {
    this.fallback = new TUIPlugin();
    this.fallback.showHeader(this.status.sessionId, this.status.version);
    this.fallback.setStatus(this.status);
  }

  private async setup(): Promise<void> {
    if (!process.stdout.isTTY) throw new Error('not a TTY');
    const tui = await import('@opentui/core');
    this.tui = tui;
    const { createCliRenderer, BoxRenderable, TextRenderable, ScrollBoxRenderable, InputRenderable, InputRenderableEvents } = tui;

    const renderer = await createCliRenderer({ exitOnCtrlC: false });
    this.renderer = renderer;

    const root = new BoxRenderable(renderer, {
      width: '100%', height: '100%', flexDirection: 'column', backgroundColor: C.bg,
    });

    // Header
    const header = new BoxRenderable(renderer, { width: '100%', height: 1, paddingLeft: 1, paddingRight: 1, backgroundColor: C.panel });
    this.headerEl = new TextRenderable(renderer, { content: '' });
    header.add(this.headerEl);

    // Transcript
    this.transcript = new ScrollBoxRenderable(renderer, {
      width: '100%', flexGrow: 1, flexShrink: 1,
      stickyScroll: true, stickyStart: 'bottom',
      paddingLeft: 1, paddingRight: 1, paddingTop: 1,
      backgroundColor: C.bg,
    });

    // Composer: 🌶 prompt + single-line input
    const composer = new BoxRenderable(renderer, {
      width: '100%', height: 3, flexDirection: 'row', alignItems: 'center',
      border: ['top'], borderColor: C.border, paddingLeft: 1, paddingRight: 1,
      backgroundColor: C.bg,
    });
    composer.add(new TextRenderable(renderer, { content: tui.t`${tui.bold(tui.fg(C.chili)('🌶'))} `, width: 3 }));
    this.input = new InputRenderable(renderer, {
      flexGrow: 1, placeholder: 'Ask anything, or /help',
      backgroundColor: C.bg, focusedBackgroundColor: C.bg,
      textColor: C.user, cursorColor: C.chili, placeholderColor: C.dim,
    });
    composer.add(this.input);

    // Status line — provider · model always visible
    const status = new BoxRenderable(renderer, { width: '100%', height: 1, paddingLeft: 1, paddingRight: 1, backgroundColor: C.panel });
    this.statusEl = new TextRenderable(renderer, { content: '' });
    status.add(this.statusEl);

    // Hints
    const hints = new BoxRenderable(renderer, { width: '100%', height: 1, paddingLeft: 1, backgroundColor: C.bg });
    hints.add(new TextRenderable(renderer, {
      content: tui.t`${tui.fg(C.dim)('Enter send · ↑↓ history · Ctrl+O model · Ctrl+P provider · /help commands · Ctrl+C quit')}`,
    }));

    root.add(header); root.add(this.transcript); root.add(composer); root.add(status); root.add(hints);
    renderer.root.add(root);

    this.input.on(InputRenderableEvents.ENTER, (value: string) => this.submit(value));
    renderer.keyInput.on('keypress', (key: KeyLike) => this.onKey(key));
    this.input.focus();
    this.refreshChrome();
  }

  // ── Key handling ──────────────────────────────────────────────────────

  private onKey(key: KeyLike): void {
    if (this.overlay) { this.onOverlayKey(key); return; }

    if (key.ctrl && key.name === 'c') { key.preventDefault(); this.exit(); return; }
    if (key.ctrl && key.name === 'd' && !this.input.value) { key.preventDefault(); this.resolveLine(null); return; }
    if (key.ctrl && key.name === 'o') { key.preventDefault(); this.submit('/model'); return; }
    if (key.ctrl && key.name === 'p') { key.preventDefault(); this.submit('/provider'); return; }
    if (key.name === 'escape') { key.preventDefault(); this.input.value = ''; this.historyIndex = -1; return; }

    if (key.name === 'up' || key.name === 'down') {
      if (!this.history.length) return;
      key.preventDefault();
      if (this.historyIndex === -1) this.draft = this.input.value;
      if (key.name === 'up') {
        this.historyIndex = this.historyIndex === -1 ? this.history.length - 1 : Math.max(0, this.historyIndex - 1);
        this.input.value = this.history[this.historyIndex] ?? '';
      } else if (this.historyIndex !== -1) {
        this.historyIndex = this.historyIndex + 1 >= this.history.length ? -1 : this.historyIndex + 1;
        this.input.value = this.historyIndex === -1 ? this.draft : (this.history[this.historyIndex] ?? '');
      }
    }
  }

  private onOverlayKey(key: KeyLike): void {
    const o = this.overlay!;
    if (key.name === 'escape' || (key.ctrl && key.name === 'c')) { key.preventDefault(); this.closeOverlay(null); return; }
    if (key.name === 'up') { key.preventDefault(); o.list.moveUp(); return; }
    if (key.name === 'down') { key.preventDefault(); o.list.moveDown(); return; }
    if (key.name === 'pageup') { key.preventDefault(); o.list.moveUp(10); return; }
    if (key.name === 'pagedown') { key.preventDefault(); o.list.moveDown(10); return; }
    if (key.name === 'return' || key.name === 'enter') {
      key.preventDefault();
      const picked = o.list.getSelectedOption();
      this.closeOverlay(picked ? String(picked.value) : null);
    }
  }

  private submit(raw: string): void {
    const value = raw.trim();
    this.input.value = '';
    this.historyIndex = -1;
    this.draft = '';
    if (!value) return;
    if (this.pendingQuestion) {
      const { secret } = this.pendingQuestion;
      this.pendingQuestion = null;
      this.addUserLine(secret ? '•'.repeat(Math.min(value.length, 12)) : value);
      this.resolveLine(value);
      return;
    }
    if (this.history[this.history.length - 1] !== value) this.history.push(value);
    this.addUserLine(value);
    this.resolveLine(value);
  }

  private resolveLine(line: string | null): void {
    const resolve = this.lineResolvers.shift();
    if (resolve) resolve(line);
    else if (line !== null) this.pendingLines.push(line);
    else this.pendingLines.push('\u0004'); // EOF marker
  }

  private exit(): void {
    this.dispose();
    process.exit(0);
  }

  // ── Rendering helpers ─────────────────────────────────────────────────

  private cwdLabel(): string {
    const cwd = process.cwd().replace(homedir(), '~');
    return cwd.length > 40 ? '…' + cwd.slice(-39) : cwd;
  }

  private refreshChrome(): void {
    if (!this.tui) return;
    const { t, bold, fg } = this.tui;
    const sess = this.status.sessionId ? `session ${this.status.sessionId}` : '';
    this.headerEl.content = t`${bold(fg(C.chili)('🌶 picante'))} ${fg(C.dim)(this.status.version ? `v${this.status.version}` : '')}   ${fg(C.dim)(sess)}`;
    const model = this.status.model || '(no model)';
    const provider = this.status.provider || 'custom';
    this.statusEl.content = t`${fg(C.dim)(provider)} ${fg(C.dim)('·')} ${bold(fg(C.amber)(model))}  ${fg(C.border)('│')}  ${fg(C.dim)(this.cwdLabel())}`;
  }

  private addStyled(content: unknown, marginBottom = 1): void {
    if (!this.tui) return;
    const el = new this.tui.TextRenderable(this.renderer, { content, width: '100%', wrapMode: 'word', marginBottom });
    this.transcript.add(el);
    // Keep the transcript bounded.
    const children = this.transcript.getChildren?.() ?? [];
    if (children.length > 400) this.transcript.remove(children[0]);
  }

  private addUserLine(text: string): void {
    const { t, bold, fg } = this.tui;
    if (text.startsWith('/')) { this.addStyled(t`${fg(C.dim)('› ' + text)}`, 0); return; }
    this.addStyled(t`${bold(fg(C.chili)('🌶'))} ${bold(fg(C.user)(text))}`);
  }

  // ── UIPlugin ──────────────────────────────────────────────────────────

  showHeader(sessionId: string, version: string): void {
    this.status.sessionId = sessionId;
    this.status.version = version;
    void this.ensureInit().then(() => {
      if (this.fallback) return; // fallback printed its own header during setup
      this.refreshChrome();
    });
  }

  setStatus(info: Partial<StatusInfo>): void {
    Object.assign(this.status, info);
    if (this.fallback) { this.fallback.setStatus(info); return; }
    if (this.tui) this.refreshChrome();
  }

  onText(text: string): void {
    if (this.fallback) { this.fallback.onText(text); return; }
    if (!this.tui) return;
    this.addStyled(this.tui.t`${this.tui.fg(C.text)(text.trim())}`);
  }

  onToolCall(name: string, args: Record<string, unknown>): void {
    if (this.fallback) { this.fallback.onToolCall(name, args); return; }
    if (!this.tui) return;
    const s = JSON.stringify(args);
    const short = s.length > 70 ? s.slice(0, 67) + '…' : s;
    this.addStyled(this.tui.t`${this.tui.fg(C.dim)(`  ⚙ ${name}(${short})`)}`, 0);
  }

  onToolResult(_name: string, result: string): void {
    if (this.fallback) { this.fallback.onToolResult(_name, result); return; }
    if (!this.tui) return;
    const preview = (result.split('\n')[0] ?? '').slice(0, 70);
    const suffix = result.length > 70 ? '…' : '';
    this.addStyled(this.tui.t`${this.tui.fg(C.dim)(`    → ${preview}${suffix}`)}`, 0);
  }

  notify(text: string): void {
    if (this.fallback) { this.fallback.notify(text); return; }
    if (!this.tui) return;
    this.addStyled(this.tui.t`${this.tui.fg(C.amber)(text)}`);
  }

  clear(): void {
    if (this.fallback) { this.fallback.clear(); return; }
    if (!this.tui) return;
    for (const child of [...(this.transcript.getChildren?.() ?? [])]) this.transcript.remove(child);
  }

  async promptUser(question: string): Promise<string> {
    await this.ensureInit();
    if (this.fallback) return this.fallback.promptUser(question);
    this.notify(question);
    const prev = this.input.placeholder;
    this.input.placeholder = question.trim();
    this.pendingQuestion = { secret: /key|token|secret|password/i.test(question) };
    const line = await new Promise<string | null>(resolve => this.lineResolvers.push(resolve));
    this.pendingQuestion = null;
    this.input.placeholder = prev;
    return line ?? '';
  }

  // ── CliUIPlugin ───────────────────────────────────────────────────────

  async select(title: string, choices: SelectChoice[], current?: string): Promise<string | null> {
    await this.ensureInit();
    if (this.fallback) return this.fallback.select(title, choices, current);
    if (this.overlay) this.closeOverlay(null);

    const { BoxRenderable, TextRenderable, InputRenderable, SelectRenderable, InputRenderableEvents, t, fg } = this.tui;
    const rows = this.renderer.terminalHeight ?? process.stdout.rows ?? 24;
    const height = Math.max(8, Math.min(rows - 4, choices.length + 6));

    const box = new BoxRenderable(this.renderer, {
      position: 'absolute', top: 1, left: '10%', width: '80%', height,
      zIndex: 100, flexDirection: 'column',
      border: true, borderStyle: 'rounded', borderColor: C.chili,
      title: ` ${title} `, titleAlignment: 'left',
      backgroundColor: C.panel, paddingLeft: 1, paddingRight: 1,
    });
    const filter = new InputRenderable(this.renderer, {
      width: '100%', placeholder: 'type to filter', backgroundColor: C.panel, focusedBackgroundColor: C.panel,
      textColor: C.user, cursorColor: C.chili, placeholderColor: C.dim,
    });
    const toOptions = (list: SelectChoice[]) => list.map(c => ({
      name: c.value === current ? `${c.name}  ✓` : c.name,
      description: c.description ?? '',
      value: c.value,
    }));
    const list = new SelectRenderable(this.renderer, {
      width: '100%', flexGrow: 1, options: toOptions(choices),
      selectedIndex: Math.max(0, choices.findIndex(c => c.value === current)),
      backgroundColor: C.panel, focusedBackgroundColor: C.panel,
      textColor: C.text, focusedTextColor: C.text,
      selectedBackgroundColor: C.selected, selectedTextColor: C.amber,
      descriptionColor: C.dim, selectedDescriptionColor: C.dim,
      showDescription: true, showScrollIndicator: true, wrapSelection: true,
    });
    const hint = new TextRenderable(this.renderer, {
      content: t`${fg(C.dim)(`${choices.length} options · ↑↓ move · Enter select · Esc cancel`)}`,
    });
    box.add(filter); box.add(list); box.add(hint);
    this.renderer.root.add(box);

    filter.on(InputRenderableEvents.INPUT, () => {
      const q = String(filter.value ?? '').toLowerCase();
      const visible = q ? choices.filter(c => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)) : choices;
      list.options = toOptions(visible);
      list.selectedIndex = 0;
      hint.content = t`${fg(C.dim)(`${visible.length} of ${choices.length} · ↑↓ move · Enter select · Esc cancel`)}`;
    });

    filter.focus();
    return new Promise<string | null>(resolve => {
      this.overlay = { box, list, filter, choices, resolve };
    });
  }

  private closeOverlay(value: string | null): void {
    const o = this.overlay;
    if (!o) return;
    this.overlay = null;
    this.renderer.root.remove(o.box);
    o.box.destroyRecursively?.();
    this.input.focus();
    o.resolve(value);
  }

  async *lines(): AsyncGenerator<string> {
    await this.ensureInit();
    if (this.fallback) { yield* this.fallback.lines(); return; }
    while (true) {
      let line: string | null;
      if (this.pendingLines.length) line = this.pendingLines.shift()!;
      else line = await new Promise<string | null>(resolve => { this.lineResolvers.push(resolve); });
      if (line === null || line === '\u0004') break;
      yield line;
    }
  }

  dispose(): void {
    if (this.renderer) { try { this.renderer.destroy(); } catch { /* ignore */ } this.renderer = null; }
  }
}

interface KeyLike {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
  preventDefault(): void;
}
