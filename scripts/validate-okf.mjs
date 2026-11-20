#!/usr/bin/env node
import { readBundle } from '../lib/okf/bundle.mjs';

try {
  const bundle = await readBundle(process.argv[2] ?? 'knowledge');
  for (const warning of bundle.warnings) console.warn(`WARN ${warning}`);
  for (const error of bundle.errors) console.error(`ERROR ${error}`);
  console.log(`OKF validation: ${bundle.documents.length} Markdown files, ${bundle.errors.length} errors, ${bundle.warnings.length} warnings.`);
  if (bundle.errors.length) process.exitCode = 1;
} catch (error) {
  console.error(`Cannot read bundle: ${error.message}`);
  process.exitCode = 2;
}
