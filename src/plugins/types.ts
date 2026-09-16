// Core plugin interfaces — implemented differently per runtime (CLI, browser, server)

export interface FileSystemPlugin {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<string[]>;
  mkdir(path: string, recursive?: boolean): Promise<void>;
  delete(path: string): Promise<void>;
}

export interface UIPlugin {
  onText(text: string): void;
  onToolCall(name: string, args: Record<string, unknown>): void;
  onToolResult(name: string, result: string): void;
  promptUser(question: string): Promise<string>;
  showHeader(sessionId: string, version: string): void;
}
