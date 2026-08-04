# PI-03 QA record

## Local verification completed

- 47 of 47 source, contract, security, architecture, UX, OIDC and executable authorisation tests pass.
- Strict TypeScript compilation passes for the API, institutional web and emitted authorisation package through the local QA harness.
- The migration defines tenant-scoped foreign keys, forced RLS and explicit runtime grants for every PI-03 table.
- Database triggers reject structural rewrites to published academic periods and content rewrites to approved policy versions.
- Policy approval uses a transaction-scoped advisory lock, monotonic effective dates and deterministic content checksums.
- Academic child periods are validated inside their parent period and require a published parent before publication.
- Institution administrators read and mutate only an institution resource authorised by their persisted institution-scoped role assignment.
- Tenant activation is reevaluated under a tenant lock and conditionally updates only a tenant still in `provisioning`.
- High-consequence profile, publication, approval and activation operations require MFA.
- The institutional BFF uses a fixed route/method allowlist, same-origin validation, JSON-only bodies, size limits and server-held credentials.
- Runtime response validation rejects unknown enum states, malformed identifiers, missing activation checks and oversized API responses.
- The UI renders backend-computed activation checks and contains no local completion flag or manual checklist override.
- Responsive UI checks cover the activation rail, task canvas, boundary inspector and mobile collapse rules.
- Focus-visible styling and semantic success, warning and error states remain active through the Veza token system.
- Focused source hygiene found no explicit `any`, TypeScript suppression, unresolved TODO/FIXME or browser-authoritative tenant identifiers in PI-03 code.

## Review findings corrected before publication

1. **Policy replacement race:** version allocation originally relied only on the current approved row. A transaction-scoped advisory lock now serialises approval even when no prior version exists.
2. **Invalid policy retirement range:** replacements must take effect after the current version, preventing an invalid effective-until date.
3. **Read-scope gap:** institution administrators could mutate but not load their institution. A scoped institution-detail query now uses `institution.configure` and tenant RLS.
4. **Overbroad secret-key rejection:** the BFF now rejects exact credential-shaped keys rather than legitimate policy fields containing words such as “authorization”.
5. **Oversized client component:** the setup centre was split into orchestration, tenant-wide panels and institution-detail panels before publication.
6. **Readiness timestamp validation:** the server contract now requires a parseable evaluation timestamp.

## External validation still required

- Apply all migrations to a disposable PostgreSQL instance with the actual migration role.
- Prove cross-tenant denial using the actual `veza_app` runtime identity.
- Exercise concurrent primary-campus changes and policy approvals against PostgreSQL.
- Run browser visual regression and keyboard traversal in supported browsers.
- Exercise OIDC MFA step-up and session expiry against the selected provider.
- Re-run the repository quality workflow after GitHub-hosted runner availability is restored.

No claim is made that these external gates have passed.
