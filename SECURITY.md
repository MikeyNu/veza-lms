# Security policy

Report suspected vulnerabilities privately to the repository owner. Do not open public issues containing secrets, personal information, exploit details or tenant data.

## Baseline

- explicit tenant context on every authenticated operation
- deny-by-default authorisation
- immutable privileged-action audit events
- no production data in local or preview environments
- secrets loaded from managed secret stores in deployed environments
- dependency, code and infrastructure scanning in CI
