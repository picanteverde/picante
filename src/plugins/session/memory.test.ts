import { describe, it, expect } from 'bun:test';
import { MemorySessionPlugin } from './memory.ts';

describe('MemorySessionPlugin', () => {
  it('generates unique IDs', () => {
    const plugin = new MemorySessionPlugin();
    const ids = new Set([plugin.newId(), plugin.newId(), plugin.newId()]);
    expect(ids.size).toBe(3);
  });

  it('save and load roundtrip', () => {
    const plugin = new MemorySessionPlugin();
    const id = plugin.newId();
    plugin.save({ id, createdAt: '2026-01-01', updatedAt: '', messages: [{ role: 'user', content: 'hi' }] });
    const loaded = plugin.load(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(id);
    expect(loaded!.messages).toHaveLength(1);
  });

  it('load returns null for unknown id', () => {
    expect(new MemorySessionPlugin().load('nonexistent')).toBeNull();
  });

  it('list returns all saved session IDs', () => {
    const plugin = new MemorySessionPlugin();
    const a = plugin.newId();
    const b = plugin.newId();
    plugin.save({ id: a, createdAt: '', updatedAt: '', messages: [] });
    plugin.save({ id: b, createdAt: '', updatedAt: '', messages: [] });
    const ids = plugin.list();
    expect(ids).toContain(a);
    expect(ids).toContain(b);
  });

  it('save does not mutate original messages array', () => {
    const plugin = new MemorySessionPlugin();
    const id = plugin.newId();
    const messages = [{ role: 'user', content: 'original' }];
    plugin.save({ id, createdAt: '', updatedAt: '', messages });
    messages.push({ role: 'assistant', content: 'extra' });
    const loaded = plugin.load(id);
    expect(loaded!.messages).toHaveLength(1);
  });
});
