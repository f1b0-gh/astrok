#!/usr/bin/env node
// Read-only audit of the supplied design inputs. This is not a WCAG conformance checker.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = 'ressources/astrok-design-system';
const relativeFiles = ['tokens.json', 'README.md', 'starlight/astrok.css', 'components/Cover/preview.html',
  'assets/Logos/astrok-mark-dark.svg', 'assets/Logos/astrok-mark-ink.svg',
  'assets/Logos/astrok-mark-white.svg', 'assets/Logos/astrok-app-icon.svg'];
const contents = Object.fromEntries(await Promise.all(relativeFiles.map(async file => [file, await readFile(path.join(root, source, file), 'utf8')])));
const tokens = JSON.parse(contents['tokens.json']);
const colors = new Map(tokens.color.tokens.map(token => [token.name, token.value]));
function resolve(name, theme, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Cyclic color reference: ${name}`);
  seen.add(name);
  const value = colors.get(name)?.[theme];
  if (typeof value !== 'string') throw new Error(`Missing color ${theme}/${name}`);
  const reference = /^\{([^}]+)\}$/.exec(value);
  if (reference) return resolve(reference[1], theme, seen);
  if (!/^#[\da-f]{6}$/i.test(value)) throw new Error(`Unsupported color ${theme}/${name}: ${value}`);
  return value.toUpperCase();
}
function luminance(hex) {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error('Expected a six-digit opaque sRGB color');
  const [red, green, blue] = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}
// Independent reference points for the numeric evaluator; thresholds use unrounded results.
assert.equal(contrast('#000000', '#FFFFFF'), 21);
assert.equal(contrast('#123456', '#123456'), 1);
assert.ok(contrast('#777777', '#FFFFFF') < 4.5);
assert.ok(contrast('#767676', '#FFFFFF') > 4.5);

const checks = [];
for (const { id: theme } of tokens.color.themes) {
  for (const background of ['ground', 'surface', 'surface-raised']) {
    for (const [foreground, category, minimum] of [
      ['ink', 'ordinary-text', 4.5], ['ink-muted', 'ordinary-text', 4.5],
      ['accent-text', 'ordinary-text', 4.5], ['danger', 'ordinary-text', 4.5],
      ['control-border', 'control-boundary', 3], ['focus-ring', 'focus-indicator', 3],
    ]) {
      const foregroundColor = resolve(foreground, theme), backgroundColor = resolve(background, theme);
      const ratio = contrast(foregroundColor, backgroundColor);
      checks.push({ theme, foreground, background, category, foregroundColor, backgroundColor,
        ratio, minimum, passed: ratio >= minimum,
        scope: foreground === 'control-border' && background !== 'ground' ? 'expanded application use; source documents ground only' : 'candidate semantic use' });
    }
  }
  const ratio = contrast(resolve('on-voltage', theme), resolve('voltage', theme));
  checks.push({ theme, foreground: 'on-voltage', background: 'voltage', category: 'ordinary-text',
    foregroundColor: resolve('on-voltage', theme), backgroundColor: resolve('voltage', theme), ratio, minimum: 4.5, passed: ratio >= 4.5,
    scope: 'documented primary control pairing' });
}
const starlight = contents['starlight/astrok.css'];
const blocks = { dark: /^:root\s*\{([^}]*)\}/m.exec(starlight)?.[1], light: /:root\[data-theme='light'\]\s*\{([^}]*)\}/m.exec(starlight)?.[1] };
const mappings = [];
for (const theme of ['dark', 'light']) {
  for (const [property, token] of [['--sl-color-black', 'ground'], ['--sl-color-white', 'ink'],
    ['--sl-color-gray-3', 'ink-muted'], ['--sl-color-gray-4', 'control-border'], ['--sl-color-accent', 'accent-text']]) {
    const actual = new RegExp(`${property}:\\s*(#[\\da-f]{6})`, 'i').exec(blocks[theme] ?? '')?.[1]?.toUpperCase();
    mappings.push({ theme, property, token, actual: actual ?? null, expected: resolve(token, theme), matches: actual === resolve(token, theme) });
  }
}
const cover = contents['components/Cover/preview.html'];
const references = [...new Set([...cover.matchAll(/var\(--([\w-]+)\)/g)].map(match => match[1]))];
const defined = new Set([...cover.matchAll(/--([\w-]+)\s*:/g)].map(match => match[1]));
const geometry = contents['assets/Logos/astrok-mark-dark.svg'];
const line = /<line\b([^>]*)>/.exec(geometry)?.[1] ?? '';
const coordinate = name => Number(new RegExp(`${name}="([^"]+)"`).exec(line)?.[1]);
const slant = Math.atan(Math.abs(coordinate('x2') - coordinate('x1')) / Math.abs(coordinate('y2') - coordinate('y1'))) * 180 / Math.PI;
const findings = [
  { id: 'light-raised-control-border', severity: 'application-constraint', detail: 'Light control-border fails 3:1 on surface-raised; its documented ground pairing passes. Keep controls on surface/ground or use a separate raised-control adapter color.' },
  { id: 'raw-cover-host-dependency', severity: 'integration-required', detail: 'Cover requires host token/font variables and is a fixed 960×288 canvas with no viewport declaration. It is not a standalone responsive page.' },
  { id: 'external-font-acquisition', severity: 'integration-required', detail: 'No font files are bundled. Starlight CSS names families but loads none; cover requests Sora600 and Inter400 only, not JetBrains Mono. Validate fonts in browsers and retain fallbacks.' },
  { id: 'border-margin', severity: 'observation', detail: 'Dark control-border on surface-raised passes narrowly; avoid opacity or color blending that lowers its 3:1 margin.' },
  { id: 'source-only-not-conformance', severity: 'scope', detail: 'Opaque token calculations do not establish rendered WCAG conformance, focus visibility, layout/reflow, semantics or font loading.' },
];
const result = {
  format: 'astrok-design-system-source-audit', version: 1, source,
  inputs: relativeFiles.map(file => ({ path: `${source}/${file}`, sha256: createHash('sha256').update(contents[file]).digest('hex') })),
  thresholds: { ordinaryText: 4.5, necessaryControlsAndFocus: 3, compareUnrounded: true },
  references: {
    text: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
    nonText: 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html',
    focus: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html',
  },
  checks, summary: { total: checks.length, passed: checks.filter(check => check.passed).length, belowThreshold: checks.filter(check => !check.passed).length },
  starlightMappings: mappings,
  cover: { fixedWidth: 960, fixedHeight: 288, viewportDeclared: /<meta\b[^>]*name=["']viewport["']/i.test(cover), requiredHostVariables: references.filter(name => !defined.has(name)),
    fontStylesheetLinks: [...cover.matchAll(/<link\b[^>]*href="([^"]+)"/g)].map(match => match[1]) },
  logos: { actualStemSlantDegrees: slant, intendedSlantDegrees: 10, monochromeForLightBackground: 'astrok-mark-ink.svg',
    colorMarkForDarkBackground: 'astrok-mark-dark.svg', whiteMarkRequiresDarkBackground: true, applicationIconContainsOwnDarkBackground: true,
    note: 'Logo contrast is a brand-use diagnostic; logotypes are excepted from ordinary text contrast requirements.' },
  prohibitedPairDiagnostic: { foreground: 'voltage', background: 'light ground', ratio: contrast(resolve('voltage', 'light'), resolve('ground', 'light')) },
  adapterCandidate: { purpose: 'light control border on raised surfaces', color: '#80828E',
    ratios: Object.fromEntries(['ground', 'surface', 'surface-raised'].map(background => [background, contrast('#80828E', resolve(background, 'light'))])) },
  findings,
};
console.log(JSON.stringify(result, null, 2));
if (process.argv.includes('--strict') && result.summary.belowThreshold) process.exitCode = 1;
