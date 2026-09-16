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

export interface Config {
  baseUrl: string;
  model: string;
  apiKey: string;
  defaultHeaders: Record<string, string>;
  sessionDir: string;
  skillDirs: string[];
}

export interface ConfigPlugin {
  load(): Config;
  write(updates: Record<string, string>): void;
  configPath(): string;
}

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
}

export interface SessionPlugin {
  newId(): string;
  save(session: Session): void;
  load(id: string): Session | null;
  list(): string[];
}
