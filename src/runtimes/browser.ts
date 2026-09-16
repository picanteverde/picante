import type { Tool } from '../agent.ts';
import type { FileSystemPlugin, UIPlugin, ConfigPlugin, SessionPlugin } from '../plugins/types.ts';
import { BrowserFileSystemPlugin } from '../plugins/fs/browser.ts';
import { MemoryConfigPlugin } from '../plugins/config/memory.ts';
import { MemorySessionPlugin } from '../plugins/session/memory.ts';
import { createReadFileTool } from '../tools/read-file.ts';
import { createWriteFileTool } from '../tools/write-file.ts';
import { listModelsTool } from '../tools/list-models.ts';

// Browser-safe tools only — no shell, no monitor, no headless browser
export { createReadFileTool, createWriteFileTool };

export interface BrowserRuntime {
  fs: BrowserFileSystemPlugin;
  config: ConfigPlugin;
  session: SessionPlugin;
  tools: Tool[];
  // ui is not included here — the browser runtime expects a React UIPlugin
  // to be wired up by the host application (see Phase 12)
}

export interface BrowserRuntimeOptions {
  // Initial config values (e.g. pre-loaded from localStorage)
  initialConfig?: Record<string, string>;
  // Called whenever config is written — use to persist to localStorage
  onConfigWrite?: (toml: Record<string, string>) => void;
}

export function createBrowserRuntime(opts: BrowserRuntimeOptions = {}): BrowserRuntime {
  const fs = new BrowserFileSystemPlugin();
  const config = new MemoryConfigPlugin(opts.initialConfig ?? {}, opts.onConfigWrite);
  const session = new MemorySessionPlugin();

  const tools: Tool[] = [
    createReadFileTool(fs),
    createWriteFileTool(fs),
    listModelsTool,
    // web tools are added optionally by the host (may conflict with CSP in some contexts)
  ];

  return { fs, config, session, tools };
}

// Convenience: load config from localStorage using standard keys
export function loadConfigFromLocalStorage(): Record<string, string> {
  const keys = ['LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_DEFAULT_HEADERS'];
  const out: Record<string, string> = {};
  for (const key of keys) {
    const val = localStorage.getItem(`picante:${key}`);
    if (val) out[key] = val;
  }
  return out;
}

// Convenience: persist config to localStorage
export function saveConfigToLocalStorage(toml: Record<string, string>): void {
  for (const [key, value] of Object.entries(toml)) {
    localStorage.setItem(`picante:${key}`, value);
  }
}

// Factory that auto-wires localStorage persistence
export function createLocalStorageBrowserRuntime(): BrowserRuntime {
  return createBrowserRuntime({
    initialConfig: loadConfigFromLocalStorage(),
    onConfigWrite: saveConfigToLocalStorage,
  });
}
