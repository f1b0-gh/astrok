#!/usr/bin/env node
import { generateSite } from '@astrok/okf/site';
import { publishIndex } from '@astrok/okf/graph';
try {
  const bundle = await generateSite();
  await publishIndex({ bundle, sqlite: process.env.OKF_SQLITE !== '0' });
  for (const warning of bundle.warnings) console.warn(`WARN ${warning}`);
  console.log(`Generated ${bundle.documents.length} OKF documents and raw Markdown exports.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
