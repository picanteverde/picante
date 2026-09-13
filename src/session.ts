import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatCompletionMessageParam[];
}

export function newSessionId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export function saveSession(dir: string, session: Session): void {
  mkdirSync(dir, { recursive: true });
  session.updatedAt = new Date().toISOString();
  writeFileSync(join(dir, `${session.id}.json`), JSON.stringify(session, null, 2));
}

export function loadSession(dir: string, id: string): Session | null {
  const path = join(dir, `${id}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

export function listSessions(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''))
    .sort()
    .reverse();
}
