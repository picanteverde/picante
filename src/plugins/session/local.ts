import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Session, SessionPlugin } from '../types.ts';

export class LocalSessionPlugin implements SessionPlugin {
  constructor(private dir: string) {}

  newId(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  save(session: Session): void {
    mkdirSync(this.dir, { recursive: true });
    session.updatedAt = new Date().toISOString();
    writeFileSync(join(this.dir, `${session.id}.json`), JSON.stringify(session, null, 2));
  }

  load(id: string): Session | null {
    const path = join(this.dir, `${id}.json`);
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  }

  list(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''))
      .sort()
      .reverse();
  }
}
