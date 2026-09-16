import type { UIPlugin } from '../../types.ts';
import type { AgentUIEvent } from './types.ts';

// Bridges the imperative UIPlugin interface to React state via useSyncExternalStore.
// Host component subscribes and re-renders when events are pushed.
export class ReactUIPlugin implements UIPlugin {
  readonly events: AgentUIEvent[] = [];
  private listeners = new Set<() => void>();
  private resolvePrompt: ((value: string) => void) | null = null;

  onText(text: string): void {
    this.push({ type: 'text', text, role: 'assistant' });
  }

  onToolCall(name: string, args: Record<string, unknown>): void {
    this.push({ type: 'tool_call', name, args });
  }

  onToolResult(name: string, result: string): void {
    this.push({ type: 'tool_result', name, result });
  }

  promptUser(question: string): Promise<string> {
    this.push({ type: 'text', text: question, role: 'assistant' });
    return new Promise(resolve => { this.resolvePrompt = resolve; });
  }

  showHeader(sessionId: string, _version: string): void {
    this.push({ type: 'session_start', sessionId });
  }

  // Called by the host UI when the user submits a reply to promptUser
  resolveUserInput(value: string): void {
    if (this.resolvePrompt) {
      this.resolvePrompt(value);
      this.resolvePrompt = null;
    }
  }

  pushUserMessage(text: string): void {
    this.push({ type: 'text', text, role: 'user' });
  }

  pushError(message: string): void {
    this.push({ type: 'error', message });
  }

  // useSyncExternalStore subscribe
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // useSyncExternalStore getSnapshot — returns a stable reference that changes on each push
  getSnapshot(): AgentUIEvent[] {
    return this.events;
  }

  private push(event: AgentUIEvent): void {
    this.events.push(event);
    this.listeners.forEach(cb => cb());
  }
}
