---
type: howto
title: SDK setup example
description: A fictional how-to page illustrating links between a task and a concept.
---

# SDK setup example

This page is a **fictional example** of a linked how-to document. There is no `@example/sdk` package
supplied by Astrok, and no package installation is needed to explore the graph.

An imaginary client might accept a token like this:

```ts
// Illustrative code; Client is not an Astrok API.
const client = new Client({
  token: process.env.API_TOKEN,
});
```

The link to [Authentication](authentication.md) gives a reader the concept behind the example. The
[client model](gamma34/sdk-client.md) adds explicit relationships to its token store and to another
fictional client. These describe the model, not deployed software or a credential-management recipe.
