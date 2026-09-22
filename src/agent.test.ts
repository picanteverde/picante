import { describe, it, expect, mock } from 'bun:test';

// Must mock the openai module before importing agent
const mockCreate = mock(async () => ({
  choices: [{ message: { role: 'assistant', content: 'Hello from agent', tool_calls: null } }],
}));

mock.module('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
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

    const last = history[history.length - 1];
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
});
