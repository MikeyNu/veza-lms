# Local database identities

The local PostgreSQL container creates three service identities on first initialisation:

| Identity | Purpose | RLS behaviour |
|---|---|---|
| `veza_migrator` | Own schema objects and apply ordered migrations | Not used by either runtime |
| `veza_app` | Tenant-owned application transactions | `NOBYPASSRLS`; forced RLS applies |
| `veza_control` | Provisioning and global identity-directory operations | `BYPASSRLS`; privileged and tightly constrained |

## Start from a clean volume

Docker entrypoint initialisation scripts only run when the database volume is empty. Developers who created the old single-role database must reset the local volume once:

```bash
docker compose down -v
docker compose up -d postgres redis
pnpm --filter @veza/api db:migrate
```

This deletes local development data. It must never be used against a shared or production environment.

## Operational rules

- Runtime applications must not receive `MIGRATION_DATABASE_URL`.
- The web workspace never receives any database credential.
- The control-plane credential must be separately rotated and monitored.
- Production roles must use generated secrets, TLS and network restrictions.
- A migration is incomplete until runtime grants and RLS policies have been reviewed.
