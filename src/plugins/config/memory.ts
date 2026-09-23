import type { Config, ConfigPlugin } from '../types.ts';

const DEFAULTS: Config = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  apiKey: '',
  defaultHeaders: {},
  sessionDir: '',
  skillDirs: [],
};

// In-memory config for browser and testing — persists to a provided storage callback
export class MemoryConfigPlugin implements ConfigPlugin {
  private data: Config;
  private rawToml: Record<string, string>;
  private onWrite: (toml: Record<string, string>) => void;

  constructor(
    initial: Record<string, string> = {},
    onWrite: (toml: Record<string, string>) => void = () => {},
  ) {
    this.rawToml = { ...initial };
    this.onWrite = onWrite;
    this.data = this.parse(initial);
  }

  configPath(): string {
    return '(memory)';
  }

  get(key: string): string | undefined {
    return this.rawToml[key];
  }

  load(): Config {
    return { ...this.data };
  }

  write(updates: Record<string, string>): void {
    this.rawToml = { ...this.rawToml, ...updates };
    this.data = this.parse(this.rawToml);
    this.onWrite(this.rawToml);
  }

  private parse(toml: Record<string, string>): Config {
    let defaultHeaders: Record<string, string> = {};
    if (toml.LLM_DEFAULT_HEADERS) {
      try { defaultHeaders = JSON.parse(toml.LLM_DEFAULT_HEADERS); } catch {}
    }
    return {
      baseUrl: toml.LLM_BASE_URL ?? DEFAULTS.baseUrl,
      model: toml.LLM_MODEL ?? DEFAULTS.model,
      apiKey: toml.LLM_API_KEY ?? '',
      defaultHeaders,
      sessionDir: '',
      skillDirs: [],
    };
  }
}
