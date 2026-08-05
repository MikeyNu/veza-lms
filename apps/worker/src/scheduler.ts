import type { Pool, PoolClient, QueryResultRow } from "pg";
import { sanitizeDeliveryError } from "./delivery-error.js";
import { nextAttemptAt, retryDelaySeconds } from "./retry.js";

interface ScheduledRun extends QueryResultRow {
  readonly run_id: string;
  readonly scheduled_job_id: string;
  readonly tenant_id: string | null;
  readonly handler_key: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly scheduled_for: Date;
  readonly attempt_number: number;
  readonly maximum_attempts: number;
}

async function transaction<TResult>(
  pool: Pool,
  work: (client: PoolClient) => Promise<TResult>,
): Promise<TResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface ScheduledJobHandler {
  execute(
    payload: Readonly<Record<string, unknown>>,
    tenantId: string | null,
  ): Promise<Readonly<Record<string, unknown>>>;
}

class EventReconciliationHandler implements ScheduledJobHandler {
  constructor(
    private readonly pool: Pool,
    private readonly workerId: string,
  ) {}

  async execute(): Promise<Readonly<Record<string, unknown>>> {
    const result = await this.pool.query<{ run_id: string }>(
      "SELECT app.capture_event_reconciliation($1) run_id",
      [this.workerId],
    );
    return { reconciliationRunId: result.rows[0]?.run_id ?? null };
  }
}

export class WorkerScheduler {
  private readonly handlers = new Map<string, ScheduledJobHandler>();

  constructor(
    private readonly pool: Pool,
    private readonly workerId: string,
    private readonly batchSize: number,
    private readonly retryBaseSeconds: number,
    private readonly retryMaximumSeconds: number,
  ) {
    this.handlers.set(
      "platform.event-reconciliation",
      new EventReconciliationHandler(pool, workerId),
    );
  }

  register(handlerKey: string, handler: ScheduledJobHandler): void {
    if (this.handlers.has(handlerKey)) {
      throw new Error(`Scheduled handler ${handlerKey} is already registered`);
    }
    this.handlers.set(handlerKey, handler);
  }

  private async claimRetries(client: PoolClient): Promise<readonly ScheduledRun[]> {
    const result = await client.query<ScheduledRun>(
      `WITH candidates AS (
         SELECT run.id
         FROM scheduled_job_runs run
         JOIN scheduled_jobs job ON job.id = run.scheduled_job_id
         WHERE run.state = 'retry'
           AND run.next_attempt_at <= now()
           AND job.status <> 'retired'
         ORDER BY run.next_attempt_at, run.id
         FOR UPDATE OF run SKIP LOCKED
         LIMIT $2
       )
       UPDATE scheduled_job_runs run
       SET state = 'processing', worker_id = $1, started_at = now(), completed_at = NULL
       FROM candidates, scheduled_jobs job
       WHERE run.id = candidates.id
         AND job.id = run.scheduled_job_id
       RETURNING run.id run_id,
                 run.scheduled_job_id,
                 run.tenant_id,
                 job.handler_key,
                 job.payload,
                 run.scheduled_for,
                 run.attempt_number,
                 job.maximum_attempts`,
      [this.workerId, this.batchSize],
    );
    return result.rows;
  }

  private async claimNew(
    client: PoolClient,
    remaining: number,
  ): Promise<readonly ScheduledRun[]> {
    if (remaining <= 0) return [];
    const result = await client.query<ScheduledRun>(
      `WITH due AS (
         SELECT job.id, job.next_run_at
         FROM scheduled_jobs job
         WHERE job.status = 'active' AND job.next_run_at <= now()
         ORDER BY job.next_run_at, job.id
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       ), created AS (
         INSERT INTO scheduled_job_runs (
           scheduled_job_id, tenant_id, scheduled_for, state,
           attempt_number, worker_id
         )
         SELECT job.id, job.tenant_id, due.next_run_at, 'processing', 1, $1
         FROM due
         JOIN scheduled_jobs job ON job.id = due.id
         ON CONFLICT (scheduled_job_id, scheduled_for, attempt_number) DO NOTHING
         RETURNING id run_id, scheduled_job_id, tenant_id, scheduled_for, attempt_number
       ), advanced AS (
         UPDATE scheduled_jobs job
         SET next_run_at = CASE
               WHEN job.interval_seconds IS NULL THEN 'infinity'::timestamptz
               ELSE GREATEST(now(), job.next_run_at) + (job.interval_seconds * interval '1 second')
             END,
             status = CASE WHEN job.interval_seconds IS NULL THEN 'paused' ELSE job.status END,
             version = job.version + 1,
             updated_at = now()
         FROM due
         WHERE job.id = due.id
         RETURNING job.id
       )
       SELECT created.run_id,
              created.scheduled_job_id,
              created.tenant_id,
              job.handler_key,
              job.payload,
              created.scheduled_for,
              created.attempt_number,
              job.maximum_attempts
       FROM created
       JOIN scheduled_jobs job ON job.id = created.scheduled_job_id
       ORDER BY created.scheduled_for, created.run_id`,
      [this.workerId, remaining],
    );
    return result.rows;
  }

  private async claim(): Promise<readonly ScheduledRun[]> {
    return transaction(this.pool, async (client) => {
      const retries = await this.claimRetries(client);
      const fresh = await this.claimNew(client, this.batchSize - retries.length);
      return [...retries, ...fresh];
    });
  }

  async processDue(): Promise<{
    readonly claimed: number;
    readonly completed: number;
    readonly failed: number;
  }> {
    const runs = await this.claim();
    let completed = 0;
    let failed = 0;
    for (const run of runs) {
      const handler = this.handlers.get(run.handler_key);
      try {
        if (!handler) throw new Error(`scheduled-handler-unavailable:${run.handler_key}`);
        const result = await handler.execute(run.payload, run.tenant_id);
        const updated = await this.pool.query(
          `UPDATE scheduled_job_runs
           SET state = 'completed', completed_at = now(), result = $3, last_error = NULL
           WHERE id = $1 AND worker_id = $2 AND state = 'processing'`,
          [run.run_id, this.workerId, result],
        );
        if (updated.rowCount !== 1) throw new Error("scheduled-run-lease-lost");
        completed += 1;
      } catch (error) {
        const message = sanitizeDeliveryError(error);
        const deadLetter = run.attempt_number >= run.maximum_attempts;
        const retryAt = nextAttemptAt(
          new Date(),
          retryDelaySeconds(
            run.run_id,
            run.attempt_number,
            this.retryBaseSeconds,
            this.retryMaximumSeconds,
          ),
        );
        await transaction(this.pool, async (client) => {
          await client.query(
            `UPDATE scheduled_job_runs
             SET state = $3, completed_at = now(), next_attempt_at = $4, last_error = $5
             WHERE id = $1 AND worker_id = $2 AND state = 'processing'`,
            [
              run.run_id,
              this.workerId,
              deadLetter ? "dead-letter" : "failed",
              deadLetter ? null : retryAt,
              message.slice(0, 2_000),
            ],
          );
          if (!deadLetter) {
            await client.query(
              `INSERT INTO scheduled_job_runs (
                 scheduled_job_id, tenant_id, scheduled_for, state,
                 attempt_number, worker_id, next_attempt_at
               ) VALUES ($1,$2,$3,'retry',$4,$5,$6)
               ON CONFLICT DO NOTHING`,
              [
                run.scheduled_job_id,
                run.tenant_id,
                run.scheduled_for,
                run.attempt_number + 1,
                this.workerId,
                retryAt,
              ],
            );
          }
        });
        failed += 1;
      }
    }
    return { claimed: runs.length, completed, failed };
  }
}
