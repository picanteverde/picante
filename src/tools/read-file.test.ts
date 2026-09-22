import { describe, it, expect } from 'bun:test';
import { createReadFileTool } from './read-file.ts';
import type { FileSystemPlugin } from '../plugins/types.ts';

function mockFs(files: Record<string, string>): FileSystemPlugin {
  return {
    async read(p) { return files[p] ?? ''; },
    async write() {},
    async exists(p) { return p in files; },
    async list() { return []; },
    async mkdir() {},
    async delete() {},
  };
}

describe('read_file tool', () => {
  const fs = mockFs({ '/a.txt': 'line1\nline2\nline3\nline4\nline5' });
  const tool = createReadFileTool(fs);

  it('returns error when file not found', async () => {
    const result = await tool.execute({ path: '/missing.txt' });
    expect(result).toContain('Error: file not found');
  });

  it('reads full file with 1-based line numbers', async () => {
    const result = await tool.execute({ path: '/a.txt' });
    expect(result).toContain('1\tline1');
    expect(result).toContain('5\tline5');
  });

  it('respects offset (1-based start line)', async () => {
    const result = await tool.execute({ path: '/a.txt', offset: 3 });
    expect(result).toContain('3\tline3');
    expect(result).not.toContain('1\tline1');
  });

  it('respects limit (max lines returned)', async () => {
    const result = await tool.execute({ path: '/a.txt', limit: 2 });
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(result).toContain('1\tline1');
    expect(result).toContain('2\tline2');
  });

  it('combines offset and limit', async () => {
    const result = await tool.execute({ path: '/a.txt', offset: 2, limit: 2 });
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(result).toContain('2\tline2');
    expect(result).toContain('3\tline3');
  });
});
