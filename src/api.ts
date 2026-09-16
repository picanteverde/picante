// Phase 19 — Embedding API
// createAgent() lets any host (Next.js, Electron, CF Worker) run picante
// without the CLI wrapper.

import type { Tool } from './agent.ts';
import type { FileSystemPlugin, UIPlugin, ConfigPlugin, SessionPlugin, Config } from './plugins/types.ts';
import { runAgent } from './agent.ts';

export type { Tool, FileSystemPlugin, UIPlugin, ConfigPlugin, SessionPlugin, Config };
export { BunFileSystemPlugin } from './plugins/fs/bun.ts';
export { BrowserFileSystemPlugin } from './plugins/fs/browser.ts';
export { R2FileSystemPlugin } from './plugins/fs/r2.ts';
export { S3FileSystemPlugin } from './plugins/fs/s3.ts';
export { TUIPlugin } from './plugins/ui/tui.ts';
export { ReactUIPlugin } from './plugins/ui/react/ReactUIPlugin.ts';
export { LocalConfigPlugin } from './plugins/config/local.ts';
export { MemoryConfigPlugin } from './plugins/config/memory.ts';
export { LocalSessionPlugin } from './plugins/session/local.ts';
export { MemorySessionPlugin } from './plugins/session/memory.ts';
export { createCliRuntime } from './runtimes/cli.ts';
export { createBrowserRuntime, createLocalStorageBrowserRuntime } from './runtimes/browser.ts';
export { createServerRuntime, runServerAgent } from './runtimes/server.ts';

export interface AgentHandle {
  run(prompt: string): Promise<string>;
  stop(): void;
}

export interface CreateAgentOptions {
  config: ConfigPlugin | Config;
  tools: Tool[];
  systemPrompt?: string;
  ui?: UIPlugin;
  session?: SessionPlugin;
}

// Thin wrapper that exposes a run() / stop() handle over the agent loop.
export function createAgent(opts: CreateAgentOptions): AgentHandle {
  const cfg: Config = 'load' in opts.config ? (opts.config as ConfigPlugin).load() : opts.config as Config;
  let aborted = false;

  return {
    async run(prompt: string): Promise<string> {
      aborted = false;
      const messages = [{ role: 'user' as const, content: prompt }];
      opts.ui?.onText?.(prompt);

      const updated = await runAgent(messages, {
        config: cfg,
        tools: opts.tools,
        systemPrompt: opts.systemPrompt ?? 'You are a helpful AI assistant.',
        onStep: (event) => {
          if (aborted) throw new Error('Agent stopped');
          if (event.type === 'text') opts.ui?.onText(event.text);
          else if (event.type === 'tool_call') opts.ui?.onToolCall(event.name, event.args);
          else if (event.type === 'tool_result') opts.ui?.onToolResult(event.name, event.result);
        },
      });

      const last = [...updated].reverse().find(m => m.role === 'assistant');
      return typeof last?.content === 'string' ? last.content : '';
    },

    stop(): void {
      aborted = true;
    },
  };
}
