---
type: Workflow Event
title: Refresh requested
description: The next event after token expiry in the illustrative flow.
graph_model: gamma34/0.1
graph_kind: event
---

# Refresh requested

The fictional flow requests a refresh after [token expiry](token-expired.md).
Follow `previous_step` to find that earlier event; the graph derives this reverse
direction from the `next_step` relationship on the expiry page.

No refresh request is executed by this documentation.
