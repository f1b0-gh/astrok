import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../../../ressources/astrok-design-system/', import.meta.url);
const destination = new URL('../dist/', import.meta.url);
const tokens = JSON.parse(await readFile(new URL('tokens.json', source), 'utf8'));
const reference = value => value.replace(/^\{([a-z-]+)\}$/, 'var(--$1)');
const css = ['/* Generated from ressources/astrok-design-system/tokens.json. */'];
for (const theme of tokens.color.themes) {
  css.push(`${theme.id === 'dark' ? ':root, ' : ''}[data-theme="${theme.id}"] {`);
  css.push(`  color-scheme: ${theme.id};`);
  for (const token of tokens.color.tokens) css.push(`  --${token.name}: ${reference(token.value[theme.id])};`);
  css.push('}');
}
css.push(':root {');
for (const [name, value] of Object.entries(tokens.type.families)) css.push(`  --font-${name}: ${value};`);
for (const group of ['spacing', 'radius', 'angle']) for (const token of tokens[group].tokens) css.push(`  --${token.name}: ${token.value};`);
for (const group of tokens.type.groups) for (const style of group.styles) {
  css.push(`  --text-${style.name}-size: ${style.fontSize};`);
  css.push(`  --text-${style.name}-leading: ${style.lineHeight};`);
  css.push(`  --text-${style.name}-weight: ${style.fontWeight};`);
}
css.push('}');
css.push('/* Adapter: the source light border is below 3:1 against raised surfaces. */');
css.push(':root, [data-theme="dark"] { --control-border-on-raised: var(--control-border); }');
css.push('[data-theme="light"] { --control-border-on-raised: #80828E; }');
await mkdir(new URL('logos/', destination), { recursive: true });
await writeFile(new URL('tokens.css', destination), css.join('\n') + '\n');
await copyFile(new URL('tokens.json', source), new URL('tokens.json', destination));
await writeFile(new URL('fonts.css', destination), `/* Fonts are optional network resources; token families retain local fallbacks. */\n@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Sora:wght@600&display=swap');\n`);
const starlight = await readFile(new URL('starlight/astrok.css', source), 'utf8');
await writeFile(new URL('starlight.css', destination), `@import './tokens.css';\n${starlight}\n/* Shared semantic roles and focus treatment. */\n:root { --sl-font: var(--font-sans); --sl-font-mono: var(--font-mono); --sl-color-bg: var(--ground); --sl-color-bg-nav: var(--surface); --sl-color-bg-sidebar: var(--surface); --sl-color-hairline: var(--hairline); --sl-color-text: var(--ink); --sl-color-text-accent: var(--accent-text); }\nh1,h2,h3,h4,h5,h6 { font-family: var(--font-display); font-weight: 600; }\n@media (min-width: 50rem) { site-search button[data-open-modal] { border-color: var(--control-border); border-radius: var(--radius-md); } }\n#starlight__search { --pagefind-ui-border: var(--control-border); }\n.site-title { color: var(--ink); font-family: var(--font-display); letter-spacing: -.03em; }\n.site-title img { padding: 4px; }\n:where(a,button,input,select,textarea,summary):focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }\n`);
for (const name of ['astrok-mark-dark.svg', 'astrok-mark-ink.svg', 'astrok-mark-white.svg', 'astrok-app-icon.svg']) {
  await copyFile(new URL(`assets/Logos/${name}`, source), new URL(`logos/${name}`, destination));
}
console.log(`Built @astrok/theme from ${fileURLToPath(source)}`);
