export { openrouterProvider } from './openrouter.ts';
export { opencodeProvider } from './opencode.ts';
export { falProvider } from './fal.ts';
export { nvidiaProvider } from './nvidia.ts';
export { amdProvider } from './amd.ts';
export { infronProvider } from './infron.ts';
export type { Provider, ModelInfo } from './types.ts';

import { openrouterProvider } from './openrouter.ts';
import { opencodeProvider } from './opencode.ts';
import { falProvider } from './fal.ts';
import { nvidiaProvider } from './nvidia.ts';
import { amdProvider } from './amd.ts';
import { infronProvider } from './infron.ts';
import type { Provider } from './types.ts';

export const PROVIDERS: Record<string, Provider> = {
  openrouter: openrouterProvider,
  opencode: opencodeProvider,
  fal: falProvider,
  nvidia: nvidiaProvider,
  amd: amdProvider,
  infron: infronProvider,
};
