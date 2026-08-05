# Platform engineering quality and acceptance report

**Repository:** `MikeyNu/veza-lms`  
**Branch:** `agent/mvp-learning-delivery`  
**Pull request:** #18, Complete platform engineering operations  
**Report date:** 5 August 2026  
**Merge state:** Draft and not approved for merge

## Scope

This report covers the shared platform-engineering tranche and the final operational workspaces:

- event delivery and background processing
- communications delivery
- media and object storage
- permission-aware search
- Redis ownership
- API standards and machine access
- health and observability
- AWS infrastructure as code
- tenant media administration
- tenant service-account administration
- control-plane observability operations

## Mounted operational workspaces

### Tenant media administration

Route: `/admin/storage`

Implemented controls:

- tenant namespace creation
- storage policy creation
- quota and enforcement policy
- browser SHA-256 calculation
- presigned direct object upload
- upload completion evidence
- malware and processing-state visibility
- accessibility alternative text, caption and transcript evidence
- recording-consent capture and withdrawal
- controlled deletion request
- independent MFA-authenticated deletion approval
- usage and cost attribution display

The browser never proxies media bytes through the Next.js BFF. It registers the upload, writes directly to the signed object-store URL, then records completion evidence.

### Tenant service-account administration

Route: `/admin/service-accounts`

Implemented controls:

- tenant-scoped machine-identity directory
- principal selection
- permission scope selection
- source CIDR restrictions
- token lifetime selection
- one-time client ID and secret disclosure
- secret rotation with reason
- immediate suspension and reactivation
- permanent retirement
- active-secret fingerprint display

The read model exposes secret prefixes only. Secret hashes, salts and plaintext credentials are never returned.

### Control-plane observability

Route: `/observability`

Implemented controls:

- runtime heartbeat and capability inventory
- stale-runtime detection
- SLO definition and lifecycle
- latest achieved value, objective and error-budget evidence
- alert-rule definition and lifecycle
- alert acknowledgement and resolution
- error-fingerprint acknowledgement, resolution and ignore decisions
- runtime degraded and stopping controls
- asynchronous backlog summary

Every mutation is platform-operator guarded and writes platform audit evidence.

## Infrastructure as code

Terraform is located under `infra/terraform`.

Implemented topology:

- encrypted Terraform state bootstrap
- isolated preview, development, staging, production and disaster-recovery entry points
- account allowlists
- VPC with public, private and data subnet tiers across two availability zones
- VPC flow logs and S3 endpoint
- WAF
- ECS/Fargate API, web, control-plane and worker services
- application load balancer and CloudFront
- Aurora PostgreSQL with backups, encryption and Performance Insights
- ElastiCache Redis with encryption and Multi-AZ failover
- private S3 media and operational-log buckets
- KMS keys
- Secrets Manager
- EventBridge and SQS queues with dead-letter queues
- OpenSearch in private data subnets
- CloudWatch logs, dashboard and alarms
- AWS Backup vault, plan and selection
- Route 53 custom-domain support
- residency-gated disaster-recovery environment

CI includes Terraform formatting, state-bootstrap validation and validation of every isolated environment with `-backend=false`.

## Deterministic source guards

The following source-level tests were added:

- `apps/web/tests/platform-administration-workspaces.test.mjs`
- `apps/control-plane/tests/observability-operations.test.mjs`
- `apps/api/tests/platform-administration-contracts.test.mjs`

They guard the mounted routes and security invariants including:

- same-origin mutation BFFs
- one-time credential semantics
- no secret hash or salt exposure
- MFA deletion approval
- tenant-scoped service-account reads
- ESM-safe transcript hashing
- exact observability `status` and `state` payloads
- platform-operator guard and audit writes

## Acceptance workflow

Workflow: `.github/workflows/ci.yml`

Jobs:

1. Source, contracts and production builds
   - frozen dependency install
   - Prettier check
   - lint
   - TypeScript
   - source and contract tests
   - production builds
2. PostgreSQL identities, RLS, people workflows, worker leases and institution invariants
   - PostgreSQL 17
   - role bootstrap
   - complete migration sequence
   - worker integration tests
   - API integration tests
3. Terraform formatting and environment validation
   - recursive formatting check
   - bootstrap initialisation and validation
   - preview, development, staging, production and disaster-recovery validation

## Current execution evidence

Latest observed workflow run at the time of this report:

- workflow run: `31016995026`
- branch head: `4b0f7c730b747cc4c180b0acd5df94d376d3ed90`
- conclusion shown by GitHub: `failure`

This conclusion is not a source, migration, test, build or Terraform failure. GitHub did not allocate a runner.

Terraform job evidence:

- job: `92343524943`
- `runner_id`: `0`
- `runner_name`: empty
- `steps`: empty
- elapsed time: approximately two seconds

The source and PostgreSQL jobs in the same run also contain no executed steps.

Earlier confirming run:

- workflow run: `31015462172`
- source job: `92338245819`
- `runner_id`: `0`
- `steps`: empty

## Acceptance decision

### Implementation completion

The requested platform-engineering services and the three missing browser workspaces are implemented and pushed to the remote branch.

### Executed acceptance

Not complete. No GitHub-hosted runner has executed the quality workflow, and this environment cannot obtain a local repository checkout from GitHub. Therefore no honest claim can be made that formatting, TypeScript, builds, PostgreSQL migrations, worker integration or Terraform validation passed.

### Merge policy

PR #18 must remain draft and must not be merged until a workflow run has all three jobs allocated to real runners and completed successfully.

A valid green run must show:

- nonzero runner IDs
- nonempty step arrays
- successful source, test and build steps
- successful PostgreSQL bootstrap and migration sequence
- successful worker and API integration tests
- successful Terraform formatting and validation

## External remediation

The GitHub Actions runner allocation or repository billing/quota issue must be resolved at the repository or organisation level. Once runner capacity is restored, rerun the `quality` workflow on the current pull-request head. Any actual compiler, migration, test or Terraform findings must be patched before the pull request leaves draft state.
