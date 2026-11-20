import MagicString from 'magic-string';
import type solid from '@solidjs/vite-plugin';

/** Attribute locally compiled JSX exports without probing/executing components. */
export function solidMarker(): ReturnType<typeof solid>[number] {
  return {
    name: 'astrok-solid-renderer-identity',
    enforce: 'post',
    transform(code, id, options) {
      if (!options?.ssr || !/\.[jt]sx(?:\?|$)/.test(id)) return null;
      const tree = this.parse(code);
      const output = new MagicString(code);
      const owned = new Set<string>();
      const exported = new Set<string>();
      for (const node of tree.body) {
        const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
        if (declaration?.type === 'FunctionDeclaration' && declaration.id) owned.add(declaration.id.name);
        if (declaration?.type === 'VariableDeclaration') for (const variable of declaration.declarations) {
          if (variable.id.type === 'Identifier' && (variable.init?.type === 'ArrowFunctionExpression' || variable.init?.type === 'FunctionExpression')) owned.add(variable.id.name);
        }
      }
      for (const node of tree.body) {
        if (node.type === 'ExportDefaultDeclaration') {
          const declaration = node.declaration;
          if (declaration.type === 'Identifier') { if (owned.has(declaration.name)) exported.add(declaration.name); }
          else if (declaration.type === 'FunctionDeclaration' && declaration.id) exported.add(declaration.id.name);
          else if (declaration.type === 'ArrowFunctionExpression' || declaration.type === 'FunctionExpression' || declaration.type === 'FunctionDeclaration') {
            let name = '__astrokSolidDefault';
            while (code.includes(name)) name += '_';
            output.overwrite(node.start, declaration.start, `const ${name} = `);
            output.append(`\nexport default ${name};`);
            exported.add(name);
          }
        } else if (node.type === 'ExportNamedDeclaration' && !node.source) {
          const declaration = node.declaration;
          if (declaration?.type === 'FunctionDeclaration' && declaration.id) exported.add(declaration.id.name);
          if (declaration?.type === 'VariableDeclaration') for (const variable of declaration.declarations) {
            if (variable.id.type === 'Identifier' && (variable.init?.type === 'ArrowFunctionExpression' || variable.init?.type === 'FunctionExpression')) exported.add(variable.id.name);
          }
          for (const specifier of node.specifiers) if (specifier.local.type === 'Identifier' && owned.has(specifier.local.name)) exported.add(specifier.local.name);
        }
      }
      for (const name of exported) output.append(`\nif (typeof ${name} === 'function') Object.defineProperty(${name}, Symbol.for('astro:renderer'), {value:'@astrok/solid', configurable:true});`);
      return exported.size ? { code: output.toString(), map: output.generateMap({ hires: true, source: id, includeContent: true }) } : null;
    },
  };
}
