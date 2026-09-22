import { describe, it, expect } from 'bun:test';
import { createWriteFileTool } from './write-file.ts';
import type { FileSystemPlugin } from '../plugins/types.ts';

describe('write_file tool', () => {
  it('writes content and returns byte count', async () => {
    const written: Record<string, string> = {};
    const fs: FileSystemPlugin = {
      async read(p) { return written[p] ?? ''; },
      async write(p, c) { written[p] = c; },
      async exists(p) { return p in written; },
      async list() { return []; },
      async mkdir() {},
      async delete() {},
    };
    const tool = createWriteFileTool(fs);
    const result = await tool.execute({ path: '/out.txt', content: 'hello world' });
    expect(written['/out.txt']).toBe('hello world');
    expect(result).toContain('11');
    expect(result).toContain('/out.txt');
  });

  it('reports UTF-8 byte length, not character count', async () => {
    const fs: FileSystemPlugin = {
      async read() { return ''; }, async write() {}, async exists() { return false; },
      async list() { return []; }, async mkdir() {}, async delete() {},
    };
    const result = await createWriteFileTool(fs).execute({ path: '/u', content: '🌶' });
    expect(result).toBe('Written 4 bytes to /u');
  });

  it('exposes the expected tool definition', () => {
    const fs = {} as FileSystemPlugin;
    const fn = (createWriteFileTool(fs).definition as any).function;
    expect(fn.name).toBe('write_file');
    expect(fn.parameters.required).toEqual(['path', 'content']);
  });
});
