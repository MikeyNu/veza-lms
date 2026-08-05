# Veza AWS infrastructure

This directory defines the production reference estate for Veza Learning Cloud. It is intentionally separate from local Docker Compose and follows the product architecture boundaries:

- isolated AWS state per environment
- two availability zones by default
- private application and data subnets
- ECS/Fargate API, web, control-plane and worker runtimes
- Aurora PostgreSQL as the durable source of truth
- ElastiCache Redis for cache, locks, quotas and coordination
- S3 and CloudFront for tenant media
- EventBridge and SQS for asynchronous delivery
- OpenSearch for permission-aware search projections
- WAF, KMS, Secrets Manager, CloudWatch and AWS Backup

## Directory layout

- `bootstrap`: creates the encrypted S3 state bucket, DynamoDB lock table and KMS key
- `modules/platform`: reusable environment module
- `environments/preview`: ephemeral change validation
- `environments/development`: shared engineering environment
- `environments/staging`: production-like acceptance environment
- `environments/production`: protected South Africa production environment
- `environments/disaster-recovery`: warm recovery environment requiring explicit data-residency approval

## State bootstrap

Run the bootstrap once in the dedicated infrastructure account:

```bash
terraform -chdir=infra/terraform/bootstrap init
terraform -chdir=infra/terraform/bootstrap apply \
  -var='allowed_account_ids=["123456789012"]'
```

Record the output bucket, lock table and KMS key. Environment backends are partial by design. Configure them at initialisation time so state identifiers are not duplicated in source:

```bash
terraform -chdir=infra/terraform/environments/staging init \
  -backend-config="bucket=veza-terraform-state-xxxxxxxx" \
  -backend-config="key=staging/platform.tfstate" \
  -backend-config="region=af-south-1" \
  -backend-config="dynamodb_table=veza-terraform-locks" \
  -backend-config="kms_key_id=arn:aws:kms:af-south-1:123456789012:key/xxxxxxxx"
```

Use a distinct key and AWS account allowlist for every environment.

## Required deployment inputs

The validation defaults deliberately use public placeholder containers. Every deployed environment must override:

- `container_images` with immutable ECR image digests
- `allowed_account_ids` with the exact environment account
- `domain_name`, `hosted_zone_id` and `cloudfront_certificate_arn` when a custom domain is enabled

The CloudFront certificate must be issued in `us-east-1`. The application load balancer is an origin and should not be published as a user-facing endpoint.

## Promotion

1. Build and sign immutable images.
2. Apply preview for the pull request.
3. Promote the same image digests to development.
4. Apply staging and run migrations, synthetic checks and recovery tests.
5. Require approval before production plan and apply.
6. Keep production deletion protection enabled.

Never rebuild images between staging and production promotion.

## Disaster recovery

The recovery environment defaults to a separate AWS region and carries `RequiresResidencyApproval=true`. Do not apply it until the institution and legal data-residency decision permits the selected region.

Recovery exercises must verify:

- Aurora restore point and migration compatibility
- media object recovery and signed-delivery behaviour
- Redis rebuild from durable authorities
- EventBridge and SQS replay controls
- OpenSearch projection reconciliation
- DNS failover and certificate validity
- RTO and RPO evidence recorded in the control plane

## Validation

```bash
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/bootstrap init -backend=false
terraform -chdir=infra/terraform/bootstrap validate
for environment in preview development staging production disaster-recovery; do
  terraform -chdir="infra/terraform/environments/${environment}" init -backend=false
  terraform -chdir="infra/terraform/environments/${environment}" validate
 done
```

CI runs the same commands. Validation does not plan or apply resources and does not require AWS credentials.
