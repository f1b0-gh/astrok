---
type: Software Component
title: Example SDK client
description: An illustrative component with containment, similarity, and property relations.
graph_model: gamma34/0.1
graph_kind: thing
graph_relations:
  - target: token-store.md
    relation: contains
    family: contains
    inverse: part_of
    contexts: [example-sdk]
  - target: ../authentication.md
    relation: authenticates_using
    family: expresses
    inverse: authentication_method_of
    contexts: [example-sdk]
  - target: alternate-client.md
    relation: similar
    family: similar
    contexts: [example-sdk, authentication-interface]
---

# Example SDK client

This fictional client has three relationships:

- It contains a [token store](token-store.md).
- It uses [authentication](../authentication.md).
- Its authentication interface is similar to the [alternate client's](alternate-client.md).

The metadata records these relationships so a graph query can follow them.
The similarity applies to the stated interface; it does not mean that the two
clients are interchangeable, or that similarity carries through other clients.
