import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("worker leases events with skip-locked semantics and owner-bound acknowledgement", async () => {
  const [repository, migration] = await Promise.all([
    source("../src/outbox-repository.ts"),
    source("../../api/database/migrations/0005_outbox_delivery.sql"),
  ]);
  assert.match(repository, /FOR UPDATE SKIP LOCKED/);
  assert.match(repository, /lease_owner = \$1/);
  assert.match(repository, /dead_lettered_at/);
  assert.match(repository, /next_attempt_at/);
  assert.match(migration, /GRANT SELECT, UPDATE ON outbox_events TO veza_worker/);
  assert.match(migration, /outbox_claimable_idx/);
});

test("production delivery uses bounded EventBridge entries and never logs event payloads", async () => {
  const [config, publisher, main, packageManifest] = await Promise.all([
    source("../src/config.ts"),
    source("../src/event-publisher.ts"),
    source("../src/main.ts"),
    source("../package.json"),
  ]);
  assert.match(config, /OUTBOX_TRANSPORT=stdout is prohibited in production/);
  assert.match(config, /EVENTBRIDGE_REQUEST_TIMEOUT_MS must be shorter than the outbox lease/);
  assert.match(config, /OUTBOX_BATCH_SIZE", 10, 1, 10/);
  assert.match(publisher, /PutEventsCommand/);
  assert.match(publisher, /maximumEntryBytes = 240 \* 1024/);
  assert.match(publisher, /maximumEntries = 10/);
  assert.match(publisher, /AbortSignal\.timeout/);
  assert.match(main, /sanitizeDeliveryError/);
  assert.match(packageManifest, /"@aws-sdk\/client-eventbridge": "3\.1081\.0"/);
  assert.doesNotMatch(main, /payload:/);
  assert.doesNotMatch(publisher, /JSON\.stringify\(event\.payload\)/);
});
