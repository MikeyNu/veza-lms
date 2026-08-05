# Learning evidence runtime

This document defines the production runtime requirements for Veza Studio media, learner submission evidence, metric freshness and credential verification.

## Object storage ingest

Browser code never receives object-storage credentials.

The web application exposes same-origin chunk-forwarding routes:

- `PATCH /api/studio-upload`
- `PATCH /api/submission-upload`

Both routes require:

- `VEZA_OBJECT_STORAGE_INGEST_URL`
- `VEZA_OBJECT_STORAGE_INGEST_TOKEN`

The configured ingest service must:

1. Accept bounded binary chunks with `x-upload-session-id`, `x-object-key`, `x-upload-offset` and `x-upload-total` headers.
2. Persist chunks idempotently at the supplied offset.
3. Return the acknowledged next offset in `x-upload-offset`.
4. Reject path traversal and cross-tenant object keys.
5. Emit or invoke malware scanning after the final chunk.
6. Keep uploaded objects private. Learner and Studio delivery must use short-lived authorised retrieval URLs.

The BFF limits each forwarded chunk to 8 MiB. Database records preserve object keys, SHA-256 checksums, byte size and upload offsets.

## Malware evidence

Submission files and Studio assets begin in a pending state.

A file cannot produce an immutable submission receipt until:

- every byte is acknowledged;
- malware status is `clean`; and
- the stored checksum remains unchanged.

A Studio asset cannot become `ready` until malware status is `clean`. Meaningful images require alternative text. Audio and video require captions or a transcript. Ready asset identity, object key, checksum and byte size are immutable.

Scanner integrations must use a service identity that has only the scan-evidence operation. Human browser sessions must not receive scanner credentials.

## Metric freshness worker

The existing worker executes both transactional-outbox delivery and core metric refresh.

Required settings:

- `WORKER_DATABASE_URL`
- `WORKER_INSTANCE_ID`
- `METRIC_REFRESH_INTERVAL_MS`, default `300000`
- `METRIC_REFRESH_BATCH_SIZE`, default `25`

`veza_worker` has `BYPASSRLS` and executes `app.refresh_due_core_metrics`. Each run records:

- tenant and institution;
- worker identity;
- started and completed timestamps;
- number of refreshed metrics; and
- bounded failure evidence.

Only institutions whose latest snapshot is older than fifteen minutes are selected. Metric definitions retain their own freshness target and drill-through filters.

## Submission identity boundary

Learner submission endpoints do not trust UUID possession.

PostgreSQL verifies that:

- the enrolment learner person is linked to the authenticated global user;
- the attempt belongs to that learner;
- each upload file belongs to that attempt; and
- the linked person remains active.

Marker evidence is also identity-bound. The user writing a mark must be linked to the staff person named by the active marker allocation.

## Credential verification

Public certificate verification is read-only and uses the control-plane database connection. It resolves only a globally unique verification code and returns a bounded verification payload.

Issuance requires:

- an independently approved certificate template;
- an active award rule;
- a persisted eligible award-rule evaluation;
- a matching learner and optional enrolment; and
- immutable issuance payload and checksum evidence.

Revocation preserves the original certificate and adds revocation evidence. Verification never deletes or rewrites the issued payload.
