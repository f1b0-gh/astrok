---
type: Workflow Event
title: Token expires
description: The event preceding a refresh request in an illustrative flow.
graph_model: gamma34/0.1
graph_kind: event
graph_relations:
  - target: refresh-requested.md
    relation: next_step
    family: leads_to
    inverse: previous_step
    contexts: [example-refresh-flow]
---

# Token expires

This is the first event in the fictional refresh flow. The next modeled event
is [a refresh request](refresh-requested.md).

The `next_step` relationship records the order chosen for this example. It does
not claim that every application refreshes a token when it expires.
