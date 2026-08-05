resource "aws_cloudwatch_log_group" "migration" {
  name              = "/veza/${var.environment}/database-migration"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.platform.arn
  tags              = local.common_tags
}

resource "aws_ecs_task_definition" "migration" {
  family                   = "${local.name}-database-migration"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "database-migration"
    image     = var.container_images.api
    essential = true
    command = [
      "/bin/sh",
      "-lc",
      "pnpm --filter @veza/api db:bootstrap:production && pnpm --filter @veza/api db:migrate"
    ]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "VEZA_ENVIRONMENT", value = var.environment }
    ]
    secrets = [
      { name = "BOOTSTRAP_DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url["bootstrap"].arn },
      { name = "MIGRATION_DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url["migrator"].arn },
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url["application"].arn },
      { name = "CONTROL_PLANE_DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url["control"].arn },
      { name = "WORKER_DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url["worker"].arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.migration.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "migration"
      }
    }
    readonlyRootFilesystem = true
    linuxParameters = {
      initProcessEnabled = true
    }
  }])

  tags = local.common_tags
}
