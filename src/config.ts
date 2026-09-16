// Legacy helpers — kept for backward compat. New code should use LocalConfigPlugin directly.
export type { Config } from './plugins/types.ts';
export { LocalConfigPlugin } from './plugins/config/local.ts';

import { LocalConfigPlugin } from './plugins/config/local.ts';
import { homedir } from 'os';
import { join } from 'path';

export const GLOBAL_CONFIG_PATH = join(homedir(), '.picante', 'config.toml');

const _cfg = new LocalConfigPlugin();
export const loadConfig = () => _cfg.load();
export const writeConfig = (updates: Record<string, string>) => _cfg.write(updates);
