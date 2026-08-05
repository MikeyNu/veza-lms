variable "environment" {
  description = "Deployment environment name."
  type        = string

  validation {
    condition     = contains(["preview", "development", "staging", "production", "disaster-recovery"], var.environment)
    error_message = "environment must be preview, development, staging, production or disaster-recovery."
  }
}

variable "aws_region" {
  description = "AWS region for this environment."
  type        = string
  default     = "af-south-1"
}

variable "name_prefix" {
  description = "Resource naming prefix."
  type        = string
  default     = "veza"
}

variable "vpc_cidr" {
  description = "Environment VPC CIDR."
  type        = string
  default     = "10.40.0.0/16"
}

variable "availability_zones" {
  description = "Optional explicit pair of availability zones."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.availability_zones) == 0 || length(var.availability_zones) >= 2
    error_message = "availability_zones must be empty or contain at least two zones."
  }
}

variable "container_images" {
  description = "Container images for API, web, control plane and worker. Override all values outside validation environments."
  type        = map(string)
  default = {
    api           = "public.ecr.aws/docker/library/nginx:alpine"
    web           = "public.ecr.aws/docker/library/nginx:alpine"
    control-plane = "public.ecr.aws/docker/library/nginx:alpine"
    worker        = "public.ecr.aws/docker/library/nginx:alpine"
  }

  validation {
    condition = alltrue([
      for service in ["api", "web", "control-plane", "worker"] : contains(keys(var.container_images), service)
    ])
    error_message = "container_images must define api, web, control-plane and worker."
  }
}

variable "desired_counts" {
  description = "Desired ECS task counts."
  type        = map(number)
  default = {
    api           = 2
    web           = 2
    control-plane = 1
    worker        = 2
  }
}

variable "task_cpu" {
  description = "ECS task CPU units by service."
  type        = map(number)
  default = {
    api           = 512
    web           = 512
    control-plane = 512
    worker        = 1024
  }
}

variable "task_memory" {
  description = "ECS task memory in MiB by service."
  type        = map(number)
  default = {
    api           = 1024
    web           = 1024
    control-plane = 1024
    worker        = 2048
  }
}

variable "database_name" {
  description = "Aurora database name."
  type        = string
  default     = "veza"
}

variable "database_min_acu" {
  description = "Aurora Serverless v2 minimum capacity."
  type        = number
  default     = 0.5
}

variable "database_max_acu" {
  description = "Aurora Serverless v2 maximum capacity."
  type        = number
  default     = 8
}

variable "database_instances" {
  description = "Aurora instance count across availability zones."
  type        = number
  default     = 2

  validation {
    condition     = var.database_instances >= 1 && var.database_instances <= 8
    error_message = "database_instances must be between 1 and 8."
  }
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type."
  type        = string
  default     = "cache.t4g.small"
}

variable "opensearch_instance_type" {
  description = "OpenSearch data node type."
  type        = string
  default     = "t3.small.search"
}

variable "opensearch_instance_count" {
  description = "OpenSearch data node count."
  type        = number
  default     = 2
}

variable "domain_name" {
  description = "Optional environment application domain."
  type        = string
  default     = null
  nullable    = true
}

variable "hosted_zone_id" {
  description = "Optional Route 53 hosted zone ID."
  type        = string
  default     = null
  nullable    = true
}

variable "cloudfront_certificate_arn" {
  description = "Optional us-east-1 ACM certificate ARN for the CloudFront alias."
  type        = string
  default     = null
  nullable    = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention period."
  type        = number
  default     = 30
}

variable "media_retention_days" {
  description = "Default S3 noncurrent media retention period."
  type        = number
  default     = 2555
}

variable "enable_deletion_protection" {
  description = "Protect stateful production resources from deletion."
  type        = bool
  default     = false
}

variable "enable_nat_per_az" {
  description = "Create one NAT gateway per availability zone."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "AWS Backup retention period."
  type        = number
  default     = 35
}

variable "tags" {
  description = "Additional tags applied to resources."
  type        = map(string)
  default     = {}
}
