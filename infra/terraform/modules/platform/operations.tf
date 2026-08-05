resource "aws_sns_topic" "operations" {
  name              = "${local.name}-operations"
  kms_master_key_id = aws_kms_key.platform.id
  tags              = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.name}-alb-5xx"
  alarm_description   = "Application load balancer 5xx responses exceed the operational threshold."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }
  alarm_actions = [aws_sns_topic.operations.arn]
  ok_actions    = [aws_sns_topic.operations.arn]
  tags          = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${local.name}-database-cpu"
  alarm_description   = "Aurora CPU remains high."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.main.cluster_identifier
  }
  alarm_actions = [aws_sns_topic.operations.arn]
  tags          = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${local.name}-redis-cpu"
  alarm_description   = "Redis engine CPU remains high."
  namespace           = "AWS/ElastiCache"
  metric_name         = "EngineCPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 75
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.replication_group_id
  }
  alarm_actions = [aws_sns_topic.operations.arn]
  tags          = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "queue_age" {
  for_each = aws_sqs_queue.work

  alarm_name          = "${local.name}-${each.key}-queue-age"
  alarm_description   = "${each.key} queue age exceeds five minutes."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 300
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    QueueName = each.value.name
  }
  alarm_actions = [aws_sns_topic.operations.arn]
  tags          = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "opensearch_red" {
  alarm_name          = "${local.name}-opensearch-red"
  alarm_description   = "OpenSearch cluster entered red status."
  namespace           = "AWS/ES"
  metric_name         = "ClusterStatus.red"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    DomainName = aws_opensearch_domain.main.domain_name
    ClientId   = data.aws_caller_identity.current.account_id
  }
  alarm_actions = [aws_sns_topic.operations.arn]
  tags          = local.common_tags
}

resource "aws_cloudwatch_dashboard" "platform" {
  dashboard_name = "${local.name}-platform"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "ALB request volume and 5xx"
          region = var.aws_region
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main.arn_suffix],
            [".", "HTTPCode_ELB_5XX_Count", ".", "."]
          ]
          period = 300
          stat   = "Sum"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Aurora and Redis CPU"
          region = var.aws_region
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBClusterIdentifier", aws_rds_cluster.main.cluster_identifier],
            ["AWS/ElastiCache", "EngineCPUUtilization", "ReplicationGroupId", aws_elasticache_replication_group.main.replication_group_id]
          ]
          period = 300
          stat   = "Average"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 24
        height = 6
        properties = {
          title  = "Asynchronous queue age"
          region = var.aws_region
          metrics = [
            for key, queue in aws_sqs_queue.work :
            ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", queue.name, { label = key }]
          ]
          period = 60
          stat   = "Maximum"
        }
      }
    ]
  })
}

resource "aws_backup_vault" "main" {
  name        = "${local.name}-backup"
  kms_key_arn = aws_kms_key.platform.arn
  tags        = local.common_tags
}

resource "aws_iam_role" "backup" {
  name = "${local.name}-backup"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "backup.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "restore" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

resource "aws_backup_plan" "main" {
  name = "${local.name}-backup"

  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 21 * * ? *)"
    start_window      = 60
    completion_window = 360

    lifecycle {
      cold_storage_after = var.backup_retention_days > 90 ? 90 : 0
      delete_after       = var.backup_retention_days
    }

    recovery_point_tags = local.common_tags
  }

  tags = local.common_tags
}

resource "aws_backup_selection" "main" {
  iam_role_arn = aws_iam_role.backup.arn
  name         = "${local.name}-stateful"
  plan_id      = aws_backup_plan.main.id
  resources = [
    aws_rds_cluster.main.arn,
    aws_s3_bucket.media.arn
  ]
}
