# Graph example

A fictional SDK illustrates containment, similarity and event ordering using
Astrok's `gamma34/0.1` extension. This bundle is separate from the user guide.

From the repository root:

```sh
node scripts/validate-okf.mjs examples/graph/knowledge
npm run graph -- neighbors gamma34/sdk-client --root examples/graph/knowledge --family contains
npm run graph -- path gamma34/token-expired gamma34/refresh-requested --root examples/graph/knowledge --family leads_to
```

See the [bundle](knowledge/index.md) for the model and the
[reference](knowledge/gamma34/reference.md) for metadata rules. The commands query
Markdown directly; they do not require a server or write build output.
