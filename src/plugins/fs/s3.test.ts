import { describe, it, expect } from 'bun:test';
import { S3FileSystemPlugin, type S3Client } from './s3.ts';

function fakeClient() {
  const calls: Array<[string, ...unknown[]]> = [];
  const store = new Map<string, string>();
  const client: S3Client = {
    async getObject(b, k) { calls.push(['get', b, k]); const v = store.get(k); if (v === undefined) throw new Error('NoSuchKey'); return v; },
    async putObject(b, k, body) { calls.push(['put', b, k]); store.set(k, body); },
    async headObject(b, k) { calls.push(['head', b, k]); return store.has(k); },
    async listObjects(b, prefix) { calls.push(['list', b, prefix]); return [...store.keys()].filter(k => k.startsWith(prefix)); },
    async deleteObject(b, k) { calls.push(['delete', b, k]); store.delete(k); },
  };
  return { client, calls, store };
}

describe('S3FileSystemPlugin', () => {
  it('passes the bucket name and prefixed key to every client call', async () => {
    const { client, calls } = fakeClient();
    const fs = new S3FileSystemPlugin(client, 'my-bucket', 'root/');
    await fs.write('/a.txt', '1');
    await fs.read('a.txt');
    await fs.exists('a.txt');
    await fs.list('dir');
    await fs.delete('a.txt');
    expect(calls).toEqual([
      ['put', 'my-bucket', 'root/a.txt'],
      ['get', 'my-bucket', 'root/a.txt'],
      ['head', 'my-bucket', 'root/a.txt'],
      ['list', 'my-bucket', 'root/dir/'],
      ['delete', 'my-bucket', 'root/a.txt'],
    ]);
  });

  it('works without a prefix', async () => {
    const { client, calls } = fakeClient();
    const fs = new S3FileSystemPlugin(client, 'b');
    await fs.write('x', '1');
    expect(calls[0]).toEqual(['put', 'b', 'x']);
  });

  it('read/write round-trip and exists', async () => {
    const { client } = fakeClient();
    const fs = new S3FileSystemPlugin(client, 'b');
    expect(await fs.exists('f')).toBe(false);
    await fs.write('f', 'body');
    expect(await fs.exists('f')).toBe(true);
    expect(await fs.read('f')).toBe('body');
    await expect(fs.read('missing')).rejects.toThrow();
  });

  it('mkdir is a no-op', async () => {
    const { client, calls } = fakeClient();
    await new S3FileSystemPlugin(client, 'b').mkdir('d');
    expect(calls).toEqual([]);
  });
});
