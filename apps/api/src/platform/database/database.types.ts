import type { PoolClient, QueryResult, QueryResultRow } from "pg";

export interface DatabaseExecutor {
  query<TRow extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<TRow>>;
}

export interface PostgresError extends Error {
  readonly code: string;
  readonly constraint?: string;
}

export function isPostgresError(error: unknown, code: string, constraint?: string): error is PostgresError {
  if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "string") return false;
  if (error.code !== code) return false;
  return constraint === undefined || ("constraint" in error && error.constraint === constraint);
}

export type TransactionWork<TResult> = (client: PoolClient) => Promise<TResult>;
