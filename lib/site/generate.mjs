import { generateSite as generate } from '../../packages/okf/src/site/generate.mjs';
import { adoptLegacyDefaults } from './legacy.mjs';
export { loadSite, normalizeBase, withBase, assertOwnedDirectory } from '../../packages/okf/src/site/generate.mjs';
export async function generateSite(options) {
  if (options === undefined) await adoptLegacyDefaults(process.cwd());
  return generate(options);
}
