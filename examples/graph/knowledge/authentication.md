---
type: concept
graph_model: gamma34/0.1
graph_kind: concept
title: Authentication
description: A fictional authentication concept used to demonstrate graph relationships.
tags:
  - security
  - sdk
---

# Authentication

In the [fictional SDK example](gamma34/index.md), a client attaches a bearer
token to an API request. The example uses this idea to connect a software
component to a concept in the graph. Astrok does not supply this SDK or an
authentication service.

## Token lifecycle

The [token store](gamma34/token-store.md) holds the example client's token.
The modeled flow goes from [token expiry](gamma34/token-expired.md) to a
[refresh request](gamma34/refresh-requested.md). This is an authored sequence,
not a promise that a real client refreshes tokens automatically.

[SDK setup example](install-sdk.md) shows how a how-to document can refer back
to this concept.

## Security

The example contains no real credentials. Tokens for a real application belong
in that application's credential handling, outside a publicly served knowledge bundle.
