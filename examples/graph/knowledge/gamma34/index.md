# Gamma(3,4) example

This small model uses a fictional SDK to show how Astrok's `gamma34/0.1`
extension records relationships. You can read the linked pages without using
a database or learning the extension first.

## Components

- [Example SDK client](sdk-client.md) — Contains a token store and uses authentication.
- [Token store](token-store.md) — Belongs to the example client.
- [Alternate client](alternate-client.md) — Has a similar authentication interface.

## A sequence

- [Token expires](token-expired.md) — The first event in this chosen example.
- [Refresh requested](refresh-requested.md) — The next event in the model.

## The shared concept

- [Authentication](../authentication.md) — Explains the idea attached to the client.

A `contains` relation can be read backward as `part_of`. A `similar` relation
is valid only in its stated context. An event sequence describes ordering,
not proof of causation. These are project conventions, separate from OKF itself.

- [Graph reference](reference.md) — Fields, defaults, validation and query behavior.
