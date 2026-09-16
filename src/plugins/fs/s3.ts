import type { FileSystemPlugin } from '../types.ts';

// AWS S3 (or S3-compatible) FileSystem plugin.
// Uses the fetch-based S3 request signing — compatible with Cloudflare Workers and Node.
// For simplicity, wraps an S3-compatible client interface rather than the full AWS SDK.
export class S3FileSystemPlugin implements FileSystemPlugin {
  constructor(
    private client: S3Client,
    private bucket: string,
    private prefix = '',
  ) {}

  private key(path: string): string {
    const p = path.replace(/^\/+/, '');
    return this.prefix ? `${this.prefix.replace(/\/$/, '')}/${p}` : p;
  }

  async read(path: string): Promise<string> {
    return this.client.getObject(this.bucket, this.key(path));
  }

  async write(path: string, content: string): Promise<void> {
    await this.client.putObject(this.bucket, this.key(path), content);
  }

  async exists(path: string): Promise<boolean> {
    return this.client.headObject(this.bucket, this.key(path));
  }

  async list(path: string): Promise<string[]> {
    const prefix = this.key(path.endsWith('/') ? path : path + '/');
    return this.client.listObjects(this.bucket, prefix);
  }

  async mkdir(_path: string, _recursive?: boolean): Promise<void> {
    // S3 has no real directories — no-op
  }

  async delete(path: string): Promise<void> {
    await this.client.deleteObject(this.bucket, this.key(path));
  }
}

// Minimal S3 client interface — implement with @aws-sdk/client-s3 or a fetch-based client
export interface S3Client {
  getObject(bucket: string, key: string): Promise<string>;
  putObject(bucket: string, key: string, body: string): Promise<void>;
  headObject(bucket: string, key: string): Promise<boolean>;
  listObjects(bucket: string, prefix: string): Promise<string[]>;
  deleteObject(bucket: string, key: string): Promise<void>;
}
