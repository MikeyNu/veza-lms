resource "aws_ecs_cluster" "main" {
  name = "${local.name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.common_tags
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

resource "aws_iam_role" "ecs_execution" {
  name = "${local.name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "runtime-secrets"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue", "kms:Decrypt"]
      Resource = [
        aws_secretsmanager_secret.database.arn,
        aws_kms_key.platform.arn
      ]
    }]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.name}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role_policy" "ecs_task" {
  name = "platform-runtime"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetObjectAttributes"
        ]
        Resource = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:ChangeMessageVisibility",
          "sqs:GetQueueAttributes",
          "sqs:SendMessage"
        ]
        Resource = concat(
          [for queue in aws_sqs_queue.work : queue.arn],
          [for queue in aws_sqs_queue.dead_letter : queue.arn]
        )
      },
      {
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = [aws_cloudwatch_event_bus.platform.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.database.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"]
        Resource = [aws_kms_key.platform.arn, aws_kms_key.media.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["es:ESHttpGet", "es:ESHttpPost", "es:ESHttpPut", "es:ESHttpDelete"]
        Resource = ["${aws_opensearch_domain.main.arn}/*"]
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "service" {
  for_each = local.services

  name              = "/veza/${var.environment}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.platform.arn
  tags              = local.common_tags
}

resource "aws_lb" "main" {
  name               = substr("${local.name}-alb", 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [for subnet in aws_subnet.public : subnet.id]
  enable_deletion_protection = var.enable_deletion_protection
  drop_invalid_header_fields = true
  tags                       = local.common_tags
}

resource "aws_lb_target_group" "service" {
  for_each = { for key, service in local.services : key => service if service.public }

  name        = substr("${local.name}-${replace(each.key, "control-plane", "control")}", 0, 32)
  port        = each.value.port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    enabled             = true
    path                = each.value.health_path
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-399"
  }

  deregistration_delay = 30
  tags                 = local.common_tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = var.cloudfront_certificate_arn == null ? "forward" : "redirect"

    dynamic "forward" {
      for_each = var.cloudfront_certificate_arn == null ? [1] : []
      content { target_group { arn = aws_lb_target_group.service["web"].arn } }
    }

    dynamic "redirect" {
      for_each = var.cloudfront_certificate_arn == null ? [] : [1]
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count = var.cloudfront_certificate_arn == null ? 0 : 1

  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.cloudfront_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["web"].arn
  }
}

locals {
  application_listener_arn = var.cloudfront_certificate_arn == null
    ? aws_lb_listener.http.arn
    : aws_lb_listener.https[0].arn
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = local.application_listener_arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["api"].arn
  }

  condition { path_pattern { values = ["/v1/*"] } }
}

resource "aws_lb_listener_rule" "control_plane" {
  listener_arn = local.application_listener_arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["control-plane"].arn
  }

  condition {
    path_pattern { values = ["/control-plane", "/control-plane/*"] }
  }
}

resource "aws_ecs_task_definition" "service" {
  for_each = local.services

  family                   = "${local.name}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.task_cpu[each.key])
  memory                   = tostring(var.task_memory[each.key])
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = each.key
    image     = var.container_images[each.key]
    essential = true
    portMappings = each.value.port > 0 ? [{
      containerPort = each.value.port
      hostPort      = each.value.port
      protocol      = "tcp"
    }] : []
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "VEZA_ENVIRONMENT", value = var.environment },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "DATABASE_SECRET_ARN", value = aws_secretsmanager_secret.database.arn },
      { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379" },
      { name = "OBJECT_STORAGE_BUCKET", value = aws_s3_bucket.media.id },
      { name = "OBJECT_STORAGE_REGION", value = var.aws_region },
      { name = "EVENTBRIDGE_EVENT_BUS_NAME", value = aws_cloudwatch_event_bus.platform.name },
      { name = "OPENSEARCH_ENDPOINT", value = "https://${aws_opensearch_domain.main.endpoint}" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service[each.key].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = each.key
      }
    }
    readonlyRootFilesystem = true
    linuxParameters = {
      initProcessEnabled = true
    }
    healthCheck = each.value.port > 0 ? {
      command     = ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:${each.value.port}${each.value.health_path} || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    } : null
  }])

  tags = local.common_tags
}

resource "aws_ecs_service" "service" {
  for_each = local.services

  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = var.desired_counts[each.key]
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = each.key == "worker" ? 50 : 100
  deployment_maximum_percent         = 200
  enable_execute_command             = true
  health_check_grace_period_seconds  = each.value.public ? 60 : null

  network_configuration {
    subnets          = [for subnet in aws_subnet.private : subnet.id]
    security_groups  = [aws_security_group.application.id]
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = each.value.public ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.service[each.key].arn
      container_name   = each.key
      container_port   = each.value.port
    }
  }

  lifecycle { ignore_changes = [desired_count] }

  depends_on = [
    aws_lb_listener.http,
    aws_ecs_cluster_capacity_providers.main
  ]

  tags = local.common_tags
}

resource "aws_appautoscaling_target" "service" {
  for_each = { for key, service in local.services : key => service if key != "control-plane" }

  max_capacity       = max(var.desired_counts[each.key] * 4, 4)
  min_capacity       = max(var.desired_counts[each.key], 1)
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.service[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each = aws_appautoscaling_target.service

  name               = "${local.name}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = each.value.resource_id
  scalable_dimension = each.value.scalable_dimension
  service_namespace  = each.value.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
