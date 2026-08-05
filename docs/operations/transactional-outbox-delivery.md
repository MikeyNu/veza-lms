# Transactional outbox delivery

Veza writes domain events to `outbox_events` in the same PostgreSQL transaction as the consequential domain change. The dedicated `@veza/worker` process is the only runtime component allowed to deliver those records across tenants.

## Service identity

`veza_worker` is a dedicated PostgreSQL identity with `BYPASSRLS`, but it receives access only to `outbox_events`. It does not share the application, control-plane or migration credentials. Production credentials must be generated and rotated through the deployment secret manager.

## Claiming and acknowledgement

Workers claim due events in deterministic order using `FOR UPDATE SKIP LOCKED`. A claim records an opaque worker instance ID, lease time and incremented attempt number. A worker may acknowledge only a row still leased to its own instance ID. Expired leases can be reclaimed after `OUTBOX_LEASE_SECONDS`.

Successful delivery records `published_at` and the provider reference. Failed delivery clears the lease, records a bounded error message and schedules deterministic exponential backoff with jitter. Events reaching `OUTBOX_MAXIMUM_ATTEMPTS` are moved to dead-letter state and are not automatically retried.

## Transports

- `eventbridge`: required in production. Events are delivered with the AWS SDK for JavaScript v3 in batches of at most ten and below a conservative request-size safety limit.
- `stdout`: local-development transport only. Production startup fails closed when this transport is selected.

The stdout transport logs event metadata but never logs the domain payload. The EventBridge detail contains the versioned envelope and domain payload required by downstream consumers.

## Required production alarms

- oldest pending event exceeds the readiness threshold;
- pending event count exceeds the readiness threshold;
- any event enters dead-letter state;
- repeated worker polling failure;
- EventBridge rejected-entry rate is non-zero; and
- no successful publication during a period with a non-empty backlog.

Dead-letter requeue must be implemented as an authenticated, audited operator workflow. Direct database updates are not an operational runbook.
