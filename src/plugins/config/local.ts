import { homedir } from 'os';
import { join, dirname } from 'path';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import type { Config, ConfigPlugin } from '../types.ts';

const GLOBAL_CONFIG_PATH = join(homedir(), '.picante', 'config.toml');

function readToml(path: string): Record<string, string> {
  try {
    const text = readFileSync(path, 'utf8');
    const out: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const m = line.match(/^(\w+)\s*=\s*"(.*)"/);
      if (m?.[1] != null && m?.[2] != null) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

export class LocalConfigPlugin implements ConfigPlugin {
  private path: string;

  constructor(path = GLOBAL_CONFIG_PATH) {
    this.path = path;
  }

  configPath(): string {
    return this.path;
  }

  load(): Config {
    const toml: Record<string, string> = {
      ...readToml(this.path),
      ...readToml(join(process.cwd(), '.picante.toml')),
    };

    let defaultHeaders: Record<string, string> = {};
    const headersRaw = process.env.LLM_DEFAULT_HEADERS ?? toml.LLM_DEFAULT_HEADERS;
    if (headersRaw) {
      try { defaultHeaders = JSON.parse(headersRaw); } catch {}
    }

    return {
      baseUrl: process.env.LLM_BASE_URL ?? toml.LLM_BASE_URL ?? 'https://api.openai.com/v1',
      model: process.env.LLM_MODEL ?? toml.LLM_MODEL ?? 'gpt-4o',
      apiKey: process.env.LLM_API_KEY ?? toml.LLM_API_KEY ?? '',
      defaultHeaders,
      sessionDir: join(homedir(), '.picante', 'sessions'),
      skillDirs: [
        join(homedir(), '.picante', 'skills'),
        join(process.cwd(), '.picante', 'skills'),
      ],
    };
  }

  write(updates: Record<string, string>): void {
    mkdirSync(dirname(this.path), { recursive: true });
    let lines: string[] = [];
    try { lines = readFileSync(this.path, 'utf8').split('\n'); } catch {}
    while (lines.length && lines[lines.length - 1] === '') lines.pop();

    const written = new Set<string>();
    const newLines = lines.map(line => {
      const m = line.match(/^(\w+)\s*=/);
      if (m?.[1] && updates[m[1]] !== undefined) {
        written.add(m[1]);
        return `${m[1]} = "${updates[m[1]]}"`;
      }
      return line;
    });

    for (const [key, value] of Object.entries(updates)) {
      if (!written.has(key)) newLines.push(`${key} = "${value}"`);
    }

    writeFileSync(this.path, newLines.join('\n').trimEnd() + '\n');
  }
}
