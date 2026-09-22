import { describe, it, expect, mock, beforeEach } from 'bun:test';

const mockCreate = mock(async (..._args: unknown[]): Promise<any> => ({
  choices: [{ message: { role: 'assistant', content: 'server reply', tool_calls: null } }],
}));
mock.module('openai', () => ({
  default: class MockOpenAI { chat = { completions: { create: mockCreate } }; },
}));

const { createServerRuntime, runServerAgent } = await import('./server.ts');
const { MemoryConfigPlugin } = await import('../plugins/config/memory.ts');
import type { FileSystemPlugin } from '../plugins/types.ts';

function memFs(): FileSystemPlugin & { files: Record<string, string> } {
  const files: Record<string, string> = {};
  return {
    files,
    async read(p) { return files[p] ?? ''; },
    async write(p, c) { files[p] = c; },
    async exists(p) { return p in files; },
    async list() { return Object.keys(files); },
    async mkdir() {}, async delete(p) { delete files[p]; },
  };
}
const toolNames = (rt: { tools: Array<{ definition: unknown }> }) =>
  rt.tools.map(t => (t.definition as { function: { name: string } }).function.name);

beforeEach(() => mockCreate.mockClear());

describe('createServerRuntime', () => {
  it('wires read_file, write_file and list_models against the given fs', async () => {
    const fs = memFs();
    const rt = createServerRuntime(fs, new MemoryConfigPlugin());
    expect(toolNames(rt)).toEqual(['read_file', 'write_file', 'list_models']);
    const write = rt.tools.find(t => (t.definition as { function: { name: string } }).function.name === 'write_file')!;
    await write.execute({ path: '/x', content: 'hi' });
    expect(fs.files['/x']).toBe('hi');
  });

  it('appends extra tools and never includes shell tools', () => {
    const extra = { definition: { type: 'function' as const, function: { name: 'custom', parameters: {} } }, execute: async () => '' };
    const rt = createServerRuntime(memFs(), new MemoryConfigPlugin(), [extra]);
    expect(toolNames(rt)).toContain('custom');
    expect(toolNames(rt)).not.toContain('run_shell');
  });
});

describe('runServerAgent', () => {
  it('appends the prompt to the history and returns messages + finalText', async () => {
    const rt = createServerRuntime(memFs(), new MemoryConfigPlugin({ LLM_API_KEY: 'k' }));
    const history = [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'old' }];
    const res = await runServerAgent(rt, { prompt: 'now', conversationHistory: history });
    expect(res.finalText).toBe('server reply');
    expect(res.messages.map(m => (m as { role: string }).role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    const req = mockCreate.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    expect(req.messages.at(-1)).toEqual({ role: 'user', content: 'now' });
  });

  it('uses the default system prompt when none is given', async () => {
    const rt = createServerRuntime(memFs(), new MemoryConfigPlugin());
    await runServerAgent(rt, { prompt: 'p' });
    const req = mockCreate.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    expect(req.messages[0]?.role).toBe('system');
    expect(req.messages[0]?.content).toContain('file system tools');
  });

  it('returns empty finalText when the assistant content is not a string', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: null, tool_calls: null } }] });
    const rt = createServerRuntime(memFs(), new MemoryConfigPlugin());
    expect((await runServerAgent(rt, { prompt: 'p' })).finalText).toBe('');
  });
});
