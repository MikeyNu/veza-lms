resource "aws_kms_key" "platform" {
  description             = "Veza ${var.environment} platform encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags                    = local.common_tags
}

resource "aws_kms_alias" "platform" {
  name          = "alias/${local.name}-platform"
  target_key_id = aws_kms_key.platform.key_id
}

resource "aws_kms_key" "media" {
  description             = "Veza ${var.environment} media encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags                    = local.common_tags
}

resource "aws_kms_alias" "media" {
  name          = "alias/${local.name}-media"
  target_key_id = aws_kms_key.media.key_id
}

resource "aws_s3_bucket" "media" {
  bucket_prefix = "${local.name}-media-"
  force_destroy = !var.enable_deletion_protection
  tags          = merge(local.common_tags, { DataClassification = "tenant-content" })
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.media.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }

  rule {
    id     = "noncurrent-retention"
    status = "Enabled"
    noncurrent_version_expiration { noncurrent_days = var.media_retention_days }
  }
}

resource "aws_s3_bucket" "logs" {
  bucket_prefix = "${local.name}-logs-"
  force_destroy = !var.enable_deletion_protection
  tags          = merge(local.common_tags, { DataClassification = "operational" })
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.platform.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    id     = "archive-and-expire"
    status = "Enabled"
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    expiration { days = 365 }
  }
}

resource "random_password" "database" {
  length           = 40
  special          = true
  override_special = "!#$%&*+-=?^_~"
}

resource "aws_secretsmanager_secret" "database" {
  name_prefix             = "${local.name}/database/"
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = var.enable_deletion_protection ? 30 : 0
  tags                    = local.common_tags
}

resource "aws_rds_cluster" "main" {
  cluster_identifier              = "${local.name}-postgres"
  engine                          = "aurora-postgresql"
  engine_mode                     = "provisioned"
  database_name                   = var.database_name
  master_username                 = "veza_admin"
  master_password                 = random_password.database.result
  db_subnet_group_name            = aws_db_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.database.id]
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.platform.arn
  backup_retention_period         = var.backup_retention_days
  preferred_backup_window         = "22:00-23:00"
  preferred_maintenance_window    = "sun:23:30-mon:00:30"
  copy_tags_to_snapshot           = true
  deletion_protection             = var.enable_deletion_protection
  skip_final_snapshot             = !var.enable_deletion_protection
  final_snapshot_identifier       = var.enable_deletion_protection ? "${local.name}-final" : null
  enabled_cloudwatch_logs_exports = ["postgresql"]

  serverlessv2_scaling_configuration {
    min_capacity = var.database_min_acu
    max_capacity = var.database_max_acu
  }

  tags = local.common_tags
}

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-database"
  subnet_ids = [for subnet in aws_subnet.data : subnet.id]
  tags       = local.common_tags
}

resource "aws_rds_cluster_instance" "main" {
  count = var.database_instances

  identifier                   = "${local.name}-postgres-${count.index + 1}"
  cluster_identifier           = aws_rds_cluster.main.id
  instance_class               = "db.serverless"
  engine                       = aws_rds_cluster.main.engine
  engine_version               = aws_rds_cluster.main.engine_version
  publicly_accessible          = false
  performance_insights_enabled = true
  monitoring_interval          = 60
  monitoring_role_arn          = aws_iam_role.rds_monitoring.arn
  tags                         = local.common_tags
}

resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name}-rds-monitoring"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    engine   = "postgresql"
    host     = aws_rds_cluster.main.endpoint
    port     = 5432
    database = var.database_name
    username = aws_rds_cluster.main.master_username
    password = random_password.database.result
  })
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name}-redis"
  subnet_ids = [for subnet in aws_subnet.data : subnet.id]
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${local.name}-redis"
  description                = "Veza ${var.environment} cache, locks and rate limits"
  node_type                  = var.redis_node_type
  port                       = 6379
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  kms_key_id                 = aws_kms_key.platform.arn
  snapshot_retention_limit   = var.backup_retention_days
  maintenance_window         = "sun:01:00-sun:02:00"
  apply_immediately          = false
  tags                       = local.common_tags
}

resource "aws_opensearch_domain" "main" {
  domain_name    = replace("${local.name}-search", "_", "-")
  engine_version = "OpenSearch_2.17"

  cluster_config {
    instance_type            = var.opensearch_instance_type
    instance_count           = var.opensearch_instance_count
    zone_awareness_enabled   = var.opensearch_instance_count > 1
    dedicated_master_enabled = false

    dynamic "zone_awareness_config" {
      for_each = var.opensearch_instance_count > 1 ? [1] : []
      content { availability_zone_count = 2 }
    }
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = 50
    throughput  = 125
  }

  encrypt_at_rest {
    enabled    = true
    kms_key_id = aws_kms_key.platform.arn
  }

  node_to_node_encryption { enabled = true }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  vpc_options {
    subnet_ids         = slice([for subnet in aws_subnet.data : subnet.id], 0, min(2, var.opensearch_instance_count))
    security_group_ids = [aws_security_group.search.id]
  }

  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { AWS = aws_iam_role.ecs_task.arn }
      Action   = "es:ESHttp*"
      Resource = "arn:${data.aws_partition.current.partition}:es:${var.aws_region}:${data.aws_caller_identity.current.account_id}:domain/${replace("${local.name}-search", "_", "-")}/*"
    }]
  })

  tags = local.common_tags
}
