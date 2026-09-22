import { describe, it, expect, mock } from 'bun:test';

// Must mock the openai module before importing agent
const mockCreate = mock(async (..._args: unknown[]): Promise<any> => ({
  choices: [{ message: { role: 'assistant', content: 'Hello from agent', tool_calls: null } }],
}));

const ctorArgs: unknown[] = [];
mock.module('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
    constructor(opts: unknown) { ctorArgs.push(opts); }
  },
}));

const { runAgent } = await import('./agent.ts');

const baseOpts = {
  config: {
    baseUrl: 'https://example.com/v1',
    model: 'test-model',
    apiKey: 'sk-test',
    defaultHeaders: {},
    sessionDir: '',
    skillDirs: [],
  },
  tools: [],
  systemPrompt: 'You are a test assistant.',
  onStep: undefined,
};

describe('runAgent', () => {
  it('returns history with assistant reply on simple text response', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'Hello from agent', tool_calls: null } }],
    });

    const history = await runAgent([{ role: 'user', content: 'hi' }], {
      ...baseOpts,
      onStep: undefined,
    });

    const last = history[history.length - 1]!;
    expect(last.role).toBe('assistant');
    expect((last as any).content).toContain('Hello');
  });

  it('emits onStep text event for assistant content', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'step text', tool_calls: null } }],
    });

    const events: any[] = [];
    await runAgent([{ role: 'user', content: 'go' }], {
      ...baseOpts,
      onStep: (e) => events.push(e),
    });

    expect(events.some(e => e.type === 'text' && e.text === 'step text')).toBe(true);
  });

  it('throws descriptive error when provider returns no choices', async () => {
    mockCreate.mockResolvedValueOnce({
      error: { message: 'model does not support function calling' },
    });

    await expect(
      runAgent([{ role: 'user', content: 'hi' }], baseOpts),
    ).rejects.toThrow('Provider returned no choices');
  });

  it('includes provider error detail in the thrown message', async () => {
    mockCreate.mockResolvedValueOnce({ error: { message: 'insufficient credits' } });

    const err = await runAgent(
      [{ role: 'user', content: 'hi' }], baseOpts,
    ).catch((e: Error) => e);
    expect((err as Error).message).toContain('insufficient credits');
  });

  it('dispatches tool calls and appends tool results to history', async () => {
    // First call: returns a tool_call; second call: returns final text
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call-1',
              function: { name: 'echo_tool', arguments: '{"msg":"ping"}' },
            }],
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: 'assistant', content: 'done', tool_calls: null } }],
      });

    const events: any[] = [];
    const tool = {
      definition: {
        type: 'function' as const,
        function: { name: 'echo_tool', description: 'echo', parameters: { type: 'object', properties: {}, required: [] } },
      },
      execute: async ({ msg }: { msg: string }) => `echo: ${msg}`,
    };

    await runAgent([{ role: 'user', content: 'call tool' }], {
      ...baseOpts,
      tools: [tool],
      onStep: (e) => events.push(e),
    });

    expect(events.some(e => e.type === 'tool_call' && e.name === 'echo_tool')).toBe(true);
    expect(events.some(e => e.type === 'tool_result' && e.result === 'echo: ping')).toBe(true);
  });

  it('skips tools/tool_choice params when no tools are registered', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'ok', tool_calls: null } }],
    });

    await runAgent([{ role: 'user', content: 'hi' }], { ...baseOpts, tools: [] });

    const callArg = mockCreate.mock.calls.at(-1)?.[0] as any;
    expect(callArg.tools).toBeUndefined();
    expect(callArg.tool_choice).toBeUndefined();
  });

  it('records an error result when the tool name is unknown', async () => {
    mockCreate
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [
        { id: 'c1', function: { name: 'nope', arguments: '{}' } },
      ] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'done', tool_calls: null } }] });
    const events: any[] = [];
    const history = await runAgent([{ role: 'user', content: 'x' }], { ...baseOpts, onStep: e => events.push(e) });
    expect(events.find(e => e.type === 'tool_result')?.result).toBe('Error: unknown tool "nope"');
    const toolMsg = history.find(m => m.role === 'tool') as any;
    expect(toolMsg.tool_call_id).toBe('c1');
    expect(toolMsg.content).toBe('Error: unknown tool "nope"');
  });

  it('turns a throwing tool into an "Error: ..." result instead of crashing', async () => {
    mockCreate
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [
        { id: 'c1', function: { name: 'bad', arguments: '{}' } },
      ] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'done', tool_calls: null } }] });
    const tool = {
      definition: { type: 'function' as const, function: { name: 'bad', parameters: {} } },
      execute: async () => { throw new Error('disk on fire'); },
    };
    const events: any[] = [];
    await runAgent([{ role: 'user', content: 'x' }], { ...baseOpts, tools: [tool], onStep: e => events.push(e) });
    expect(events.find(e => e.type === 'tool_result')?.result).toBe('Error: disk on fire');
  });

  it('passes {} to the tool when arguments are not valid JSON', async () => {
    mockCreate
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [
        { id: 'c1', function: { name: 'echo', arguments: '{broken' } },
      ] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'done', tool_calls: null } }] });
    let received: unknown;
    const tool = {
      definition: { type: 'function' as const, function: { name: 'echo', parameters: {} } },
      execute: async (a: unknown) => { received = a; return 'ok'; },
    };
    await runAgent([{ role: 'user', content: 'x' }], { ...baseOpts, tools: [tool] });
    expect(received).toEqual({});
  });

  it('sends tools and tool_choice="auto" when tools are registered', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'ok', tool_calls: null } }] });
    const tool = { definition: { type: 'function' as const, function: { name: 't', parameters: {} } }, execute: async () => '' };
    await runAgent([{ role: 'user', content: 'x' }], { ...baseOpts, tools: [tool] });
    const req = mockCreate.mock.calls.at(-1)?.[0] as any;
    expect(req.tool_choice).toBe('auto');
    expect(req.tools).toEqual([tool.definition]);
  });

  it('prepends the system prompt and does not mutate the input messages', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'ok', tool_calls: null } }] });
    const input = [{ role: 'user' as const, content: 'x' }];
    const history = await runAgent(input, baseOpts);
    expect(input).toHaveLength(1);
    expect(history).toHaveLength(2);
    const req = mockCreate.mock.calls.at(-1)?.[0] as any;
    expect(req.messages[0]).toEqual({ role: 'system', content: 'You are a test assistant.' });
    expect(req.model).toBe('test-model');
  });

  it('injects opencode session headers only for opencode.ai base URLs', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { role: 'assistant', content: 'ok', tool_calls: null } }] });
    await runAgent([{ role: 'user', content: 'x' }], baseOpts);
    expect((ctorArgs.at(-1) as any).defaultHeaders['x-opencode-session']).toBeUndefined();

    await runAgent([{ role: 'user', content: 'x' }], {
      ...baseOpts, config: { ...baseOpts.config, baseUrl: 'https://opencode.ai/zen/go/v1', defaultHeaders: { 'x-opencode-session': 'fixed' } },
    });
    const h = (ctorArgs.at(-1) as any).defaultHeaders;
    expect(h['x-opencode-session']).toBe('fixed');
    expect(h['User-Agent']).toBe('picante/1.0');
  });

  it('stops after 50 steps if the model keeps calling tools', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [
      { id: 'c', function: { name: 'loop', arguments: '{}' } },
    ] } }] });
    const tool = { definition: { type: 'function' as const, function: { name: 'loop', parameters: {} } }, execute: async () => 'again' };
    const before = mockCreate.mock.calls.length;
    await runAgent([{ role: 'user', content: 'x' }], { ...baseOpts, tools: [tool] });
    expect(mockCreate.mock.calls.length - before).toBe(50);
    mockCreate.mockReset();
  });
});
