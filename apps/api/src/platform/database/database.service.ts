import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import type { TenantId } from "@veza/contracts";
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import type { TransactionWork } from "./database.types.js";

function poolConfig(connectionString: string | undefined, applicationName: string): PoolConfig {
  return {
    ...(connectionString ? { connectionString } : {}),
    application_name: applicationName,
    max: Number(process.env.DATABASE_POOL_MAX ?? 12),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 15_000),
  };
}

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly applicationPool = new Pool(poolConfig(process.env.DATABASE_URL, "veza-api-application"));
  private readonly controlPlanePool = new Pool(
    poolConfig(process.env.CONTROL_PLANE_DATABASE_URL ?? process.env.DATABASE_URL, "veza-api-control-plane"),
  );

  async withTenantTransaction<TResult>(tenantId: TenantId, work: TransactionWork<TResult>): Promise<TResult> {
    return this.withTransaction(this.applicationPool, async (client) => {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('app.data_plane', 'application', true)");
      return work(client);
    });
  }

  async withControlPlaneTransaction<TResult>(work: TransactionWork<TResult>): Promise<TResult> {
    return this.withTransaction(this.controlPlanePool, async (client) => {
      await client.query("SELECT set_config('app.data_plane', 'control', true)");
      return work(client);
    });
  }

  async controlPlaneQuery<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<TRow>> {
    return this.controlPlanePool.query<TRow>(text, [...values]);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.applicationPool.end(), this.controlPlanePool.end()]);
  }

  private async withTransaction<TResult>(pool: Pool, work: TransactionWork<TResult>): Promise<TResult> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
