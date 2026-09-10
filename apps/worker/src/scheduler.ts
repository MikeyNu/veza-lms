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

interface StaleScheduledRun extends QueryResultRow {
  readonly run_id: string;
  readonly scheduled_job_id: string;
  readonly tenant_id: string | null;
  readonly scheduled_for: Date;
  readonly attempt_number: number;
  readonly maximum_attempts: number;
  readonly job_status: "active" | "paused" | "retired";
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

export class PlatformGovernanceSweepHandler implements ScheduledJobHandler {
  constructor(
    private readonly pool: Pool,
    private readonly functionName:
      | "expire_support_sessions"
      | "apply_due_commercial_policy",
  ) {}

  async execute(): Promise<Readonly<Record<string, unknown>>> {
    const result = await this.pool.query<{ result: Readonly<Record<string, unknown>> }>(
      `SELECT app.${this.functionName}() result`,
    );
    return result.rows[0]?.result ?? {};
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

  private async recoverStaleRuns(): Promise<number> {
    return transaction(this.pool, async (client) => {
      const stale = await client.query<StaleScheduledRun>(
        `SELECT run.id run_id,
                run.scheduled_job_id,
                run.tenant_id,
                run.scheduled_for,
                run.attempt_number,
                job.maximum_attempts,
                job.status job_status
         FROM scheduled_job_runs run
         JOIN scheduled_jobs job ON job.id = run.scheduled_job_id
         WHERE run.state = 'processing'
           AND COALESCE(run.leased_at, run.started_at) < now() - interval '5 minutes'
         ORDER BY COALESCE(run.leased_at, run.started_at), run.id
         FOR UPDATE OF run SKIP LOCKED
         LIMIT $1`,
        [this.batchSize],
      );
      let recovered = 0;
      for (const run of stale.rows) {
        const deadLetter =
          run.job_status === "retired" || run.attempt_number >= run.maximum_attempts;
        const updated = await client.query(
          `UPDATE scheduled_job_runs
           SET state = $2,
               completed_at = now(),
               next_attempt_at = NULL,
               last_error = 'stale-scheduler-lease-recovered',
               leased_at = NULL
           WHERE id = $1 AND state = 'processing'
           RETURNING id`,
          [run.run_id, deadLetter ? "dead-letter" : "failed"],
        );
        if (updated.rowCount !== 1) continue;
        recovered += 1;
        if (!deadLetter) {
          await client.query(
            `INSERT INTO scheduled_job_runs (
               scheduled_job_id, tenant_id, scheduled_for, state,
               attempt_number, worker_id, next_attempt_at, leased_at
             ) VALUES ($1,$2,$3,'retry',$4,'lease-recovery',now(),NULL)
             ON CONFLICT DO NOTHING`,
            [
              run.scheduled_job_id,
              run.tenant_id,
              run.scheduled_for,
              run.attempt_number + 1,
            ],
          );
        }
      }
      return recovered;
    });
  }

  private async claimRetry(client: PoolClient): Promise<ScheduledRun | undefined> {
    const result = await client.query<ScheduledRun>(
      `WITH candidate AS (
         SELECT run.id
         FROM scheduled_job_runs run
         JOIN scheduled_jobs job ON job.id = run.scheduled_job_id
         WHERE run.state = 'retry'
           AND run.next_attempt_at <= now()
           AND job.status <> 'retired'
         ORDER BY run.next_attempt_at, run.id
         FOR UPDATE OF run SKIP LOCKED
         LIMIT 1
       )
       UPDATE scheduled_job_runs run
       SET state = 'processing', worker_id = $1, started_at = now(),
           completed_at = NULL, next_attempt_at = NULL, leased_at = now()
       FROM candidate, scheduled_jobs job
       WHERE run.id = candidate.id
         AND job.id = run.scheduled_job_id
       RETURNING run.id run_id,
                 run.scheduled_job_id,
                 run.tenant_id,
                 job.handler_key,
                 job.payload,
                 run.scheduled_for,
                 run.attempt_number,
                 job.maximum_attempts`,
      [this.workerId],
    );
    return result.rows[0];
  }

  private async claimNew(client: PoolClient): Promise<ScheduledRun | undefined> {
    const result = await client.query<ScheduledRun>(
      `WITH due AS (
         SELECT job.id, job.next_run_at
         FROM scheduled_jobs job
         WHERE job.status = 'active' AND job.next_run_at <= now()
         ORDER BY job.next_run_at, job.id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       ), created AS (
         INSERT INTO scheduled_job_runs (
           scheduled_job_id, tenant_id, scheduled_for, state,
           attempt_number, worker_id, leased_at
         )
         SELECT job.id, job.tenant_id, due.next_run_at, 'processing', 1, $1, now()
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
           AND EXISTS (
             SELECT 1 FROM created WHERE created.scheduled_job_id = job.id
           )
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
      [this.workerId],
    );
    return result.rows[0];
  }

  private async claimOne(): Promise<ScheduledRun | undefined> {
    return transaction(this.pool, async (client) => {
      const retry = await this.claimRetry(client);
      if (retry) return retry;
      return this.claimNew(client);
    });
  }

  private async fail(run: ScheduledRun, error: unknown): Promise<boolean> {
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
    return transaction(this.pool, async (client) => {
      const updated = await client.query(
        `UPDATE scheduled_job_runs
         SET state = $4, completed_at = now(), next_attempt_at = NULL,
             last_error = $5, leased_at = NULL
         WHERE id = $1 AND worker_id = $2 AND attempt_number = $3
           AND state = 'processing'
         RETURNING id`,
        [
          run.run_id,
          this.workerId,
          run.attempt_number,
          deadLetter ? "dead-letter" : "failed",
          message.slice(0, 2_000),
        ],
      );
      if (updated.rowCount !== 1) return false;
      if (!deadLetter) {
        await client.query(
          `INSERT INTO scheduled_job_runs (
             scheduled_job_id, tenant_id, scheduled_for, state,
             attempt_number, worker_id, next_attempt_at, leased_at
           ) VALUES ($1,$2,$3,'retry',$4,$5,$6,NULL)
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
      return true;
    });
  }

  async processDue(): Promise<{
    readonly claimed: number;
    readonly completed: number;
    readonly failed: number;
  }> {
    await this.recoverStaleRuns();
    let claimed = 0;
    let completed = 0;
    let failed = 0;
    for (let index = 0; index < this.batchSize; index += 1) {
      const run = await this.claimOne();
      if (!run) break;
      claimed += 1;
      const handler = this.handlers.get(run.handler_key);
      try {
        if (!handler) throw new Error(`scheduled-handler-unavailable:${run.handler_key}`);
        const result = await handler.execute(run.payload, run.tenant_id);
        const updated = await this.pool.query(
          `UPDATE scheduled_job_runs
           SET state = 'completed', completed_at = now(), result = $4,
               last_error = NULL, leased_at = NULL
           WHERE id = $1 AND worker_id = $2 AND attempt_number = $3
             AND state = 'processing'`,
          [run.run_id, this.workerId, run.attempt_number, result],
        );
        if (updated.rowCount !== 1) throw new Error("scheduled-run-lease-lost");
        completed += 1;
      } catch (error) {
        if (await this.fail(run, error)) failed += 1;
      }
    }
    return { claimed, completed, failed };
  }
}
