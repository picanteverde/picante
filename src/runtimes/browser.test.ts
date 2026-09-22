import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  createBrowserRuntime, createLocalStorageBrowserRuntime,
  loadConfigFromLocalStorage, saveConfigToLocalStorage,
} from './browser.ts';

const g = globalThis as Record<string, unknown>;
let saved: unknown; let store: Map<string, string>;
beforeEach(() => {
  saved = g.localStorage; store = new Map();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
});
afterEach(() => { g.localStorage = saved; });

describe('createBrowserRuntime', () => {
  it('provides browser-safe tools only', () => {
    const rt = createBrowserRuntime();
    const names = rt.tools.map(t => (t.definition as { function: { name: string } }).function.name);
    expect(names).toEqual(['read_file', 'write_file', 'list_models']);
  });

  it('seeds config from initialConfig and reports writes via onConfigWrite', () => {
    const writes: Record<string, string>[] = [];
    const rt = createBrowserRuntime({ initialConfig: { LLM_MODEL: 'seed' }, onConfigWrite: w => writes.push(w) });
    expect(rt.config.load().model).toBe('seed');
    rt.config.write({ LLM_API_KEY: 'k' });
    expect(writes[0]).toEqual({ LLM_MODEL: 'seed', LLM_API_KEY: 'k' });
    expect(rt.session.newId()).toBe('session-1');
  });
});

describe('localStorage helpers', () => {
  it('loadConfigFromLocalStorage reads only the picante:* keys that are set', () => {
    store.set('picante:LLM_MODEL', 'm');
    store.set('picante:LLM_API_KEY', '');
    store.set('unrelated', 'x');
    expect(loadConfigFromLocalStorage()).toEqual({ LLM_MODEL: 'm' });
  });

  it('saveConfigToLocalStorage writes prefixed keys', () => {
    saveConfigToLocalStorage({ LLM_BASE_URL: 'u', LLM_MODEL: 'm' });
    expect(store.get('picante:LLM_BASE_URL')).toBe('u');
    expect(store.get('picante:LLM_MODEL')).toBe('m');
  });

  it('createLocalStorageBrowserRuntime round-trips config through localStorage', () => {
    store.set('picante:LLM_MODEL', 'stored');
    const rt = createLocalStorageBrowserRuntime();
    expect(rt.config.load().model).toBe('stored');
    rt.config.write({ LLM_MODEL: 'changed' });
    expect(store.get('picante:LLM_MODEL')).toBe('changed');
  });
});
