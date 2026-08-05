locals {
  database_identities = {
    bootstrap = {
      username = aws_rds_cluster.main.master_username
      password = random_password.database.result
    }
    migrator = {
      username = "veza_migrator"
      password = random_password.database_identity["migrator"].result
    }
    application = {
      username = "veza_app"
      password = random_password.database_identity["application"].result
    }
    control = {
      username = "veza_control"
      password = random_password.database_identity["control"].result
    }
    worker = {
      username = "veza_worker"
      password = random_password.database_identity["worker"].result
    }
  }
}

resource "random_password" "database_identity" {
  for_each = toset(["migrator", "application", "control", "worker"])

  length           = 40
  special          = true
  override_special = "!$%&*+-=?^_~"
}

resource "aws_secretsmanager_secret" "database_url" {
  for_each = local.database_identities

  name_prefix             = "${local.name}/database-url/${each.key}/"
  description             = "Veza ${var.environment} ${each.key} PostgreSQL connection URL"
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = var.enable_deletion_protection ? 30 : 0
  tags                    = merge(local.common_tags, { DatabaseIdentity = each.key })
}

resource "aws_secretsmanager_secret_version" "database_url" {
  for_each = local.database_identities

  secret_id = aws_secretsmanager_secret.database_url[each.key].id
  secret_string = format(
    "postgresql://%s:%s@%s:5432/%s?sslmode=require",
    each.value.username,
    urlencode(each.value.password),
    aws_rds_cluster.main.endpoint,
    var.database_name
  )
}
