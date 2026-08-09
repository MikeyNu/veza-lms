BEGIN;

-- Metric discovery intentionally runs as veza_worker so its BYPASSRLS role can
-- find due institutions across tenants. The function reads these two tables
-- directly before delegating each tenant-scoped refresh to a SECURITY DEFINER
-- function.
GRANT SELECT ON institutions, metric_snapshots TO veza_worker;

-- PostgreSQL requires UPDATE privilege on at least one column of a table used
-- with SELECT ... FOR UPDATE. Limit that capability to the non-domain
-- updated_at column instead of granting table-wide institution writes.
GRANT UPDATE (updated_at) ON institutions TO veza_worker;

COMMIT;
