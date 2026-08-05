output "environment" {
  value       = var.environment
  description = "Environment name."
}

output "vpc_id" {
  value       = aws_vpc.main.id
  description = "Environment VPC ID."
}

output "application_url" {
  value       = var.domain_name == null ? "https://${aws_cloudfront_distribution.main.domain_name}" : "https://${var.domain_name}"
  description = "Primary application URL."
}

output "cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.main.id
  description = "CloudFront distribution ID."
}

output "media_bucket" {
  value       = aws_s3_bucket.media.id
  description = "Tenant media bucket."
}

output "database_secret_arn" {
  value       = aws_secretsmanager_secret.database.arn
  description = "Aurora connection secret ARN."
}

output "database_endpoint" {
  value       = aws_rds_cluster.main.endpoint
  description = "Aurora writer endpoint."
  sensitive   = true
}

output "redis_endpoint" {
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  description = "Redis primary endpoint."
  sensitive   = true
}

output "event_bus_name" {
  value       = aws_cloudwatch_event_bus.platform.name
  description = "Domain-event bus name."
}

output "queue_urls" {
  value       = { for key, queue in aws_sqs_queue.work : key => queue.url }
  description = "Worker queue URLs."
}

output "opensearch_endpoint" {
  value       = aws_opensearch_domain.main.endpoint
  description = "Permission-aware search endpoint."
  sensitive   = true
}

output "ecs_cluster_name" {
  value       = aws_ecs_cluster.main.name
  description = "ECS cluster name."
}

output "operations_topic_arn" {
  value       = aws_sns_topic.operations.arn
  description = "Operational alert topic ARN."
}
