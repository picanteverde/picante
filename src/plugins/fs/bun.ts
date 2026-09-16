import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from 'fs';
import { dirname } from 'path';
import type { FileSystemPlugin } from '../types.ts';

export class BunFileSystemPlugin implements FileSystemPlugin {
  async read(path: string): Promise<string> {
    return readFileSync(path, 'utf8');
  }

  async write(path: string, content: string): Promise<void> {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(path);
  }

  async list(path: string): Promise<string[]> {
    return readdirSync(path);
  }

  async mkdir(path: string, recursive = true): Promise<void> {
    mkdirSync(path, { recursive });
  }

  async delete(path: string): Promise<void> {
    unlinkSync(path);
  }
}
