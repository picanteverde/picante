import type { FileSystemPlugin } from '../types.ts';

// Cloudflare R2 FileSystem plugin.
// Works inside Cloudflare Workers where R2Bucket is a CF binding.
// Pass in the R2 bucket binding and an optional key prefix.
export class R2FileSystemPlugin implements FileSystemPlugin {
  constructor(
    private bucket: R2Bucket,
    private prefix = '',
  ) {}

  private key(path: string): string {
    const p = path.replace(/^\/+/, '');
    return this.prefix ? `${this.prefix.replace(/\/$/, '')}/${p}` : p;
  }

  async read(path: string): Promise<string> {
    const obj = await this.bucket.get(this.key(path));
    if (!obj) throw new Error(`File not found: ${path}`);
    return obj.text();
  }

  async write(path: string, content: string): Promise<void> {
    await this.bucket.put(this.key(path), content, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });
  }

  async exists(path: string): Promise<boolean> {
    const obj = await this.bucket.head(this.key(path));
    return obj !== null;
  }

  async list(path: string): Promise<string[]> {
    const prefix = this.key(path.endsWith('/') ? path : path + '/');
    const result = await this.bucket.list({ prefix, delimiter: '/' });
    const names: string[] = [];
    for (const obj of result.objects) {
      names.push(obj.key.slice(prefix.length));
    }
    for (const dir of result.delimitedPrefixes ?? []) {
      names.push(dir.slice(prefix.length));
    }
    return names.sort();
  }

  async mkdir(_path: string, _recursive?: boolean): Promise<void> {
    // R2 has no real directories — no-op (dirs are implicit via key prefixes)
  }

  async delete(path: string): Promise<void> {
    await this.bucket.delete(this.key(path));
  }
}

// Minimal R2Bucket interface so the plugin compiles outside CF Workers
interface R2Bucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(key: string, value: string, opts?: { httpMetadata?: { contentType?: string } }): Promise<void>;
  head(key: string): Promise<object | null>;
  list(opts?: { prefix?: string; delimiter?: string }): Promise<{
    objects: { key: string }[];
    delimitedPrefixes?: string[];
  }>;
  delete(key: string): Promise<void>;
}
