resource "aws_cloudwatch_event_bus" "platform" {
  name = "${local.name}-events"
  tags = local.common_tags
}

resource "aws_sqs_queue" "dead_letter" {
  for_each = toset(["events", "notifications", "media", "search", "webhooks"])

  name                      = "${local.name}-${each.key}-dead-letter"
  message_retention_seconds = 1_209_600
  kms_master_key_id         = aws_kms_key.platform.arn
  tags                      = local.common_tags
}

resource "aws_sqs_queue" "work" {
  for_each = toset(["events", "notifications", "media", "search", "webhooks"])

  name                       = "${local.name}-${each.key}"
  visibility_timeout_seconds = each.key == "media" ? 900 : 120
  message_retention_seconds  = 345_600
  receive_wait_time_seconds  = 20
  kms_master_key_id          = aws_kms_key.platform.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter[each.key].arn
    maxReceiveCount     = 8
  })
  tags = local.common_tags
}

resource "aws_cloudwatch_event_rule" "platform_events" {
  name           = "${local.name}-domain-events"
  description    = "Route Veza domain events to the durable event queue"
  event_bus_name = aws_cloudwatch_event_bus.platform.name
  event_pattern = jsonencode({
    source = [{ prefix = "veza." }]
  })
  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "platform_events" {
  rule           = aws_cloudwatch_event_rule.platform_events.name
  event_bus_name = aws_cloudwatch_event_bus.platform.name
  target_id      = "event-delivery"
  arn            = aws_sqs_queue.work["events"].arn
}

resource "aws_sqs_queue_policy" "events" {
  queue_url = aws_sqs_queue.work["events"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "EventBridgeDelivery"
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.work["events"].arn
      Condition = {
        ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.platform_events.arn }
      }
    }]
  })
}
