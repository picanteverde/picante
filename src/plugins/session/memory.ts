import type { Session, SessionPlugin } from '../types.ts';

// In-memory session storage for browser and testing
export class MemorySessionPlugin implements SessionPlugin {
  private sessions = new Map<string, Session>();
  private counter = 0;

  newId(): string {
    this.counter++;
    return `session-${this.counter}`;
  }

  save(session: Session): void {
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, { ...session, messages: [...session.messages] });
  }

  load(id: string): Session | null {
    return this.sessions.get(id) ?? null;
  }

  list(): string[] {
    return [...this.sessions.keys()].reverse();
  }
}
