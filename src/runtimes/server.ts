import type { Tool } from '../agent.ts';
import type { FileSystemPlugin, ConfigPlugin } from '../plugins/types.ts';
import { runAgent } from '../agent.ts';

export interface ServerRuntime {
  fs: FileSystemPlugin;
  config: ConfigPlugin;
  tools: Tool[];
}

export interface ServerRunOptions {
  prompt: string;
  systemPrompt?: string;
  conversationHistory?: unknown[];
}

export interface ServerRunResult {
  messages: unknown[];
  finalText: string;
}

// Headless runtime for CF Workers / Node — no UI, returns structured JSON.
// Pass in a FileSystemPlugin (R2, S3, or in-memory) and a ConfigPlugin.
export function createServerRuntime(fs: FileSystemPlugin, config: ConfigPlugin, extraTools: Tool[] = []): ServerRuntime {
  const { createReadFileTool } = require('../tools/read-file.ts');
  const { createWriteFileTool } = require('../tools/write-file.ts');
  const { listModelsTool } = require('../tools/list-models.ts');

  const tools: Tool[] = [
    createReadFileTool(fs),
    createWriteFileTool(fs),
    listModelsTool,
    ...extraTools,
  ];

  return { fs, config, tools };
}

export async function runServerAgent(
  runtime: ServerRuntime,
  opts: ServerRunOptions,
): Promise<ServerRunResult> {
  const cfg = runtime.config.load();
  const history = (opts.conversationHistory ?? []) as Parameters<typeof runAgent>[0];

  history.push({ role: 'user', content: opts.prompt });

  const updated = await runAgent(history, {
    config: cfg,
    tools: runtime.tools,
    systemPrompt: opts.systemPrompt ?? 'You are a helpful AI assistant with access to file system tools.',
  });

  const finalMsg = [...updated].reverse().find(m => (m as { role: string }).role === 'assistant');
  const finalText = typeof (finalMsg as { content?: unknown })?.content === 'string'
    ? (finalMsg as { content: string }).content
    : '';

  return { messages: updated as unknown[], finalText };
}
