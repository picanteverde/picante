import { describe, it, expect, mock, beforeEach } from 'bun:test';

const mockCreate = mock(async (..._args: unknown[]): Promise<any> => ({
  choices: [{ message: { role: 'assistant', content: 'default', tool_calls: null } }],
}));
const ctorArgs: unknown[] = [];
mock.module('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
    constructor(opts: unknown) { ctorArgs.push(opts); }
  },
}));

const { createAgent, MemoryConfigPlugin, ReactUIPlugin } = await import('./api.ts');

const config = {
  baseUrl: 'https://example.com/v1', model: 'm', apiKey: 'k',
  defaultHeaders: { 'x-h': '1' }, sessionDir: '', skillDirs: [],
};

beforeEach(() => { mockCreate.mockClear(); ctorArgs.length = 0; });

describe('createAgent', () => {
  it('accepts a plain Config and returns the last assistant text', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'answer', tool_calls: null } }] });
    const agent = createAgent({ config, tools: [] });
    expect(await agent.run('q')).toBe('answer');
  });

  it('accepts a ConfigPlugin and calls load()', async () => {
    const plugin = new MemoryConfigPlugin({ LLM_MODEL: 'from-plugin', LLM_API_KEY: 'pk' });
    const agent = createAgent({ config: plugin, tools: [] });
    await agent.run('q');
    const req = mockCreate.mock.calls[0]?.[0] as { model: string };
    expect(req.model).toBe('from-plugin');
  });

  it('passes baseUrl, apiKey and defaultHeaders to the OpenAI client', async () => {
    await createAgent({ config, tools: [] }).run('q');
    expect(ctorArgs[0]).toMatchObject({ baseURL: config.baseUrl, apiKey: 'k', defaultHeaders: { 'x-h': '1' } });
  });

  it('uses a default system prompt and honours a custom one', async () => {
    await createAgent({ config, tools: [] }).run('q');
    let req = mockCreate.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    expect(req.messages[0]).toEqual({ role: 'system', content: 'You are a helpful AI assistant.' });
    expect(req.messages[1]).toEqual({ role: 'user', content: 'q' });

    await createAgent({ config, tools: [], systemPrompt: 'custom' }).run('q');
    req = mockCreate.mock.calls[1]?.[0] as typeof req;
    expect(req.messages[0]?.content).toBe('custom');
  });

  it('forwards the prompt and agent events to the ui plugin', async () => {
    mockCreate
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [
        { id: 'c1', function: { name: 'echo', arguments: '{"v":1}' } },
      ] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'final', tool_calls: null } }] });
    const ui = new ReactUIPlugin();
    const tool = {
      definition: { type: 'function' as const, function: { name: 'echo', parameters: {} } },
      execute: async (a: { v: number }) => `v=${a.v}`,
    };
    const text = await createAgent({ config, tools: [tool], ui }).run('do it');
    expect(text).toBe('final');
    expect(ui.events.map(e => e.type)).toEqual(['text', 'tool_call', 'tool_result', 'text']);
    expect(ui.events[0]).toMatchObject({ text: 'do it' });
    expect(ui.events[2]).toMatchObject({ name: 'echo', result: 'v=1' });
  });

  it('returns "" when the model replies with non-string content', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: null, tool_calls: null } }] });
    expect(await createAgent({ config, tools: [] }).run('q')).toBe('');
  });

  it('stop() called mid-run aborts at the next agent event', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'partial', tool_calls: null } }] });
    const ui = new ReactUIPlugin();
    const agent = createAgent({ config, tools: [], ui });
    // The first onText is the echoed prompt (before the model runs); stop there.
    const origOnText = ui.onText.bind(ui);
    ui.onText = (t) => { origOnText(t); if (t === 'q') agent.stop(); };
    await expect(agent.run('q')).rejects.toThrow('Agent stopped');
  });

  it('stop() before run() has no effect because run() resets the flag', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'ok', tool_calls: null } }] });
    const agent = createAgent({ config, tools: [] });
    agent.stop();
    expect(await agent.run('q')).toBe('ok');
  });
});
