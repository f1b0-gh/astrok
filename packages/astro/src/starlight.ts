import { okfIntegration } from './index.js';
import type { OkfOptions } from './index.js';
import type { AstroIntegration } from 'astro';
export function starlightIntegration(options: Omit<OkfOptions, 'presentation'> = {}): AstroIntegration {
  return okfIntegration({ ...options, presentation: 'starlight' });
}
