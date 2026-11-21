---
name: typescript-contracts
description:
  Use when implementing or reviewing Astrok TypeScript APIs, package exports, browser versus Node
  types, external data decoding, or Zod schemas. Not needed for prose-only or CSS-only changes.
---

# TypeScript contracts

Read the target package, lockfile, tsconfig and callers before choosing APIs. Use the repository's
installed TypeScript version; online examples may target a different major. Keep application
contracts separate from framework contracts.

## Compilation boundaries

| Code                       | Configuration and deliverable                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Browser application/island | Bundler module resolution, DOM libraries, framework-specific JSX compiler; separate `tsc --noEmit` |
| Published ESM library      | Executable JS plus declarations; check NodeNext consumers as well as bundler consumers             |
| Node parser/build tool     | NodeNext resolution, Node types, no ambient DOM dependency                                         |

For new package code use `strict`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. Scope adoption to the package rather than silently tightening
unrelated legacy code. Separate type imports. Infer internal values; annotate exported contracts.
Use discriminated unions for request/results so pending/error states cannot imply valid data. Avoid
widening to `any` or asserting a decoded payload into validity.

For emitted Node ESM, relative imports must resolve in the shipped JS, usually with `.js` specifiers
in source. Node's ability to execute local `.ts` files does not make a source-only npm package
portable. Export only intentional entry points; put `types` before runtime export conditions and
include referenced declarations and map sources. TypeScript `paths` does not rewrite runtime
imports.

## Runtime boundaries and Zod

Accept `unknown` at JSON, YAML, URL, config and SSE boundaries. Validate once, then pass typed
values internally. A useful dependency-neutral transport contract:

```ts
export type DecodeResult<T> =
  { ok: true; value: T } | { ok: false; issues: readonly { path: string; message: string }[] };
export type Decoder<T> = (input: unknown) => DecodeResult<T>;
```

Use existing guards for small stable contracts. Consider Zod for substantial composable schemas and
useful error paths; explain dependency and client-bundle cost before adding it. A caller-supplied
decoder keeps transport independent. If chosen, pin the version, infer schema output types, and
distinguish `z.input` from `z.output` when transforms/defaults change them.

Choose unknown-key behavior deliberately at every object level. Zod's ordinary `z.object` strips
keys; Zod 4 `z.looseObject` preserves unknown string keys. Preserve OKF metadata and future `type`
values. Strict configuration is a separate contract. Do not coerce decimal uint64 text to `number`,
or treat boolean coercion as parsing the string `"false"`. Validate before state mutation; bound
untrusted input size/depth. Schema validation does not sanitize executable HTML attributes.

## Verification

Exercise invalid inputs, unknown nested metadata, absent versus explicit-undefined properties, exact
large integers and cancellation/result state transitions. Build declarations, pack and install
actual tarballs in outside consumer fixtures, then type-check and execute imports. Check both
NodeNext and bundler resolution. Do not substitute successful transpilation for type checking.
Record actual commands and outcomes; no whole-repository language rewrite is implied.

## References

- [TypeScript module configuration](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html)
- [TypeScript compiler options](https://www.typescriptlang.org/tsconfig/)
- [Zod schemas and object key policies](https://zod.dev/api)

Consult version-appropriate documentation when APIs change; these links are living references, not a
dependency pin.
