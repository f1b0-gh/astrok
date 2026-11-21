#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readBundle } from '@astrokjs/okf';

try {
  const {values, positionals} = parseArgs({options: {strict: {type: 'boolean'}}, allowPositionals: true});
  if (positionals.length > 1) throw new Error('Usage: validate-okf.mjs [root] [--strict]');
  const bundle = await readBundle(positionals[0] ?? 'knowledge');
  // Strict links are an Astrok publication policy, not minimum OKF conformance.
  const linkErrors = values.strict ? bundle.documents.flatMap(document => document.links
    .filter(link => link.warning)
    .map(link => `${document.path}:${link.line}: ${link.warning}`)) : [];
  for (const warning of bundle.warnings) console.warn(`WARN ${warning}`);
  for (const error of [...bundle.errors, ...linkErrors]) console.error(`ERROR ${error}`);
  const errors = bundle.errors.length + linkErrors.length;
  console.log(`OKF validation: ${bundle.documents.length} Markdown files, ${errors} errors, ${bundle.warnings.length} warnings.`);
  if (errors) process.exitCode = 1;
} catch (error) {
  console.error(`Cannot validate bundle: ${error.message}`);
  process.exitCode = 2;
}
