# Runtime Foundation Rollback

Rollback disables new behavior in reverse dependency order:

1. Remove the additive offline evaluation stage.
2. Disable new working-set checkpoint writes and restore entry points.
3. Disable new product-projection writes.

Canonical protocol validation and native consent remain default-deny. Previously committed product
and checkpoint generations remain read-only evidence; partial, corrupt, unknown-version, or
unsupported state never becomes success. Rollback does not delete a user-selected location, replay
an external effect, adopt an external package, or substitute in-memory state for durable authority.

The aggregate validator rejects a changed order, missing read-only retention, weakened consent,
partial-state promotion, user-location deletion, migration widening, or effect replay. Component
rollback descriptions remain independently applicable and are not replaced by this aggregate view.
