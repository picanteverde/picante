import { describe, it, expect } from 'bun:test';
import { ReactUIPlugin } from './ReactUIPlugin.ts';

describe('ReactUIPlugin', () => {
  it('records UIPlugin calls as typed events in order', () => {
    const ui = new ReactUIPlugin();
    ui.showHeader('s1', '1.0');
    ui.onText('hi');
    ui.onToolCall('read_file', { path: 'x' });
    ui.onToolResult('read_file', 'content');
    ui.pushUserMessage('user says');
    ui.pushError('boom');
    expect(ui.events).toEqual([
      { type: 'session_start', sessionId: 's1' },
      { type: 'text', text: 'hi', role: 'assistant' },
      { type: 'tool_call', name: 'read_file', args: { path: 'x' } },
      { type: 'tool_result', name: 'read_file', result: 'content' },
      { type: 'text', text: 'user says', role: 'user' },
      { type: 'error', message: 'boom' },
    ]);
  });

  it('notifies subscribers on every push and stops after unsubscribe', () => {
    const ui = new ReactUIPlugin();
    let n = 0;
    const unsub = ui.subscribe(() => n++);
    ui.onText('a'); ui.onText('b');
    expect(n).toBe(2);
    unsub();
    ui.onText('c');
    expect(n).toBe(2);
  });

  it('getSnapshot returns the same array reference as events', () => {
    const ui = new ReactUIPlugin();
    expect(ui.getSnapshot()).toBe(ui.events);
  });

  it('promptUser pushes the question and resolves via resolveUserInput', async () => {
    const ui = new ReactUIPlugin();
    const p = ui.promptUser('Continue?');
    expect(ui.events.at(-1)).toEqual({ type: 'text', text: 'Continue?', role: 'assistant' });
    ui.resolveUserInput('yes');
    expect(await p).toBe('yes');
  });

  it('resolveUserInput is a no-op when nothing is pending', () => {
    const ui = new ReactUIPlugin();
    expect(() => ui.resolveUserInput('stray')).not.toThrow();
    expect(ui.events).toHaveLength(0);
  });

  it('resolveUserInput only answers the pending prompt once', async () => {
    const ui = new ReactUIPlugin();
    const p = ui.promptUser('q');
    ui.resolveUserInput('first');
    ui.resolveUserInput('second');
    expect(await p).toBe('first');
  });
});
