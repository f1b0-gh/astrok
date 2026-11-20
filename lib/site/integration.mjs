import { adoptLegacyDefaults } from './legacy.mjs';
import { fileURLToPath } from 'node:url';
import { okfIntegration as integration } from '../../packages/astro/src/index.ts';


export function okfIntegration(options) {
  const result = integration(options);
  const setup = result.hooks['astro:config:setup'];
  result.hooks['astro:config:setup'] = async context => {
    if (options === undefined) await adoptLegacyDefaults(fileURLToPath(context.config.root));
    return setup(context);
  };
  return result;
}
