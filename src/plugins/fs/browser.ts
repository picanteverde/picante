import type { FileSystemPlugin } from '../types.ts';

// Resolves a path string like "src/foo/bar.ts" into a FileSystemFileHandle
// relative to the given root directory handle.
async function resolveFile(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false,
): Promise<FileSystemFileHandle> {
  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
  const file = parts.pop()!;
  let dir: FileSystemDirectoryHandle = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir.getFileHandle(file, { create });
}

// Resolves a path to a directory handle relative to root.
async function resolveDir(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false,
): Promise<FileSystemDirectoryHandle> {
  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
  let dir: FileSystemDirectoryHandle = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

// Browser FileSystem plugin backed by the File System Access API.
// Call open() once (shows the directory picker) before using any other method.
// Falls back to OPFS for paths outside the picked directory.
export class BrowserFileSystemPlugin implements FileSystemPlugin {
  private root: FileSystemDirectoryHandle | null = null;

  // Opens the OS directory picker. Must be called from a user gesture (click).
  async open(): Promise<void> {
    this.root = await window.showDirectoryPicker({ mode: 'readwrite' });
  }

  // Returns the name of the currently open directory, or null if none.
  directoryName(): string | null {
    return this.root?.name ?? null;
  }

  // Whether a directory has been opened.
  isOpen(): boolean {
    return this.root !== null;
  }

  private get opfs(): Promise<FileSystemDirectoryHandle> {
    return navigator.storage.getDirectory();
  }

  async read(path: string): Promise<string> {
    const handle = await this.getFileHandle(path, false);
    const file = await handle.getFile();
    return file.text();
  }

  async write(path: string, content: string): Promise<void> {
    const handle = await this.getFileHandle(path, true);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.getFileHandle(path, false);
      return true;
    } catch {
      // Also check if it's a directory
      try {
        await this.getDirHandle(path, false);
        return true;
      } catch {
        return false;
      }
    }
  }

  async list(path: string): Promise<string[]> {
    const dir = await this.getDirHandle(path, false);
    const entries: string[] = [];
    for await (const [name] of dir) {
      entries.push(name);
    }
    return entries.sort();
  }

  async mkdir(path: string, _recursive = true): Promise<void> {
    await this.getDirHandle(path, true);
  }

  async delete(path: string): Promise<void> {
    const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
    const name = parts.pop()!;
    const parentPath = parts.join('/');
    const parent = parentPath
      ? await this.getDirHandle(parentPath, false)
      : (this.root ?? await this.opfs);
    await parent.removeEntry(name, { recursive: true });
  }

  // Resolve to FileSystemFileHandle — prefers the picked root, falls back to OPFS.
  private async getFileHandle(path: string, create: boolean): Promise<FileSystemFileHandle> {
    const root = this.root ?? await this.opfs;
    return resolveFile(root, path, create);
  }

  // Resolve to FileSystemDirectoryHandle.
  private async getDirHandle(path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    const root = this.root ?? await this.opfs;
    if (!path || path === '.' || path === '/') return root;
    return resolveDir(root, path, create);
  }
}
