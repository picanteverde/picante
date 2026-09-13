import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import type { Config } from './config.ts';

export interface Tool {
  definition: ChatCompletionTool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (args: any) => Promise<string>;
}

export interface AgentOptions {
  config: Config;
  tools: Tool[];
  systemPrompt: string;
  onStep?: (event: AgentEvent) => void;
}

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: string };

export async function runAgent(
  messages: ChatCompletionMessageParam[],
  opts: AgentOptions,
): Promise<ChatCompletionMessageParam[]> {
  const extraHeaders: Record<string, string> = { ...opts.config.defaultHeaders };
  // opencode Go endpoint requires a session ID per agent run
  if (opts.config.baseUrl.includes('opencode.ai') && !extraHeaders['x-opencode-session']) {
    extraHeaders['x-opencode-session'] = crypto.randomUUID();
  }

  const client = new OpenAI({
    baseURL: opts.config.baseUrl,
    apiKey: opts.config.apiKey,
    defaultHeaders: extraHeaders,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolMap = new Map(opts.tools.map(t => [(t.definition as any).function.name as string, t]));
  const history = [...messages];

  for (let step = 0; step < 50; step++) {
    const res = await client.chat.completions.create({
      model: opts.config.model,
      messages: [{ role: 'system', content: opts.systemPrompt }, ...history],
      tools: opts.tools.map(t => t.definition),
      tool_choice: 'auto',
    });

    const choice = res.choices[0];
    if (!choice) break;
    const msg = choice.message;
    history.push(msg as ChatCompletionMessageParam);

    if (msg.content) opts.onStep?.({ type: 'text', text: msg.content });

    if (!msg.tool_calls?.length) break;

    for (const call of msg.tool_calls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (call as any).function as { name: string; arguments: string } | undefined;
      if (!fn) continue;
      const name = fn.name;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(fn.arguments); } catch {}
      opts.onStep?.({ type: 'tool_call', name, args });

      const tool = toolMap.get(name);
      const result = tool
        ? await tool.execute(args).catch((e: Error) => `Error: ${e.message}`)
        : `Error: unknown tool "${name}"`;

      opts.onStep?.({ type: 'tool_result', name, result });

      history.push({
        role: 'tool',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tool_call_id: (call as any).id as string,
        content: result,
      } as ChatCompletionMessageParam);
    }
  }

  return history;
}
