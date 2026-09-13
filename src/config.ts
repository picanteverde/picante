import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface Config {
  baseUrl: string;
  model: string;
  apiKey: string;
  defaultHeaders: Record<string, string>;
  sessionDir: string;
  skillDirs: string[];
}

function readToml(path: string): Record<string, string> {
  try {
    const text = readFileSync(path, 'utf8');
    const out: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const m = line.match(/^(\w+)\s*=\s*"(.+)"/);
      if (m?.[1] && m?.[2]) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

export function loadConfig(): Config {
  const toml: Record<string, string> = {
    ...readToml(join(homedir(), '.picante', 'config.toml')),
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
