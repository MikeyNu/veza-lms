terraform {
  required_version = ">= 1.8.0, < 2.0.0"
  backend "s3" { encrypt = true }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
  }
}

variable "aws_region" {
  description = "Approved recovery region. Confirm data-residency approval before apply."
  type        = string
  default     = "eu-west-1"
}

variable "allowed_account_ids" {
  type    = list(string)
  default = []
}

variable "container_images" {
  type = map(string)
  default = {
    api           = "public.ecr.aws/docker/library/nginx:alpine"
    web           = "public.ecr.aws/docker/library/nginx:alpine"
    control-plane = "public.ecr.aws/docker/library/nginx:alpine"
    worker        = "public.ecr.aws/docker/library/nginx:alpine"
  }
}

variable "domain_name" {
  type     = string
  default  = null
  nullable = true
}

variable "hosted_zone_id" {
  type     = string
  default  = null
  nullable = true
}

variable "cloudfront_certificate_arn" {
  type     = string
  default  = null
  nullable = true
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = var.allowed_account_ids
}

module "platform" {
  source = "../../modules/platform"

  environment                = "disaster-recovery"
  aws_region                 = var.aws_region
  vpc_cidr                   = "10.45.0.0/16"
  container_images           = var.container_images
  desired_counts             = { api = 1, web = 1, control-plane = 1, worker = 1 }
  database_instances         = 1
  database_min_acu           = 0.5
  database_max_acu           = 8
  opensearch_instance_count  = 2
  domain_name                = var.domain_name
  hosted_zone_id             = var.hosted_zone_id
  cloudfront_certificate_arn = var.cloudfront_certificate_arn
  log_retention_days         = 90
  media_retention_days       = 2555
  backup_retention_days      = 35
  enable_deletion_protection = true
  enable_nat_per_az          = true
  tags = {
    CostCentre               = "resilience"
    EnvironmentClass         = "disaster-recovery"
    RequiresResidencyApproval = "true"
  }
}

output "platform" {
  value = {
    application_url  = module.platform.application_url
    ecs_cluster_name = module.platform.ecs_cluster_name
    media_bucket     = module.platform.media_bucket
    event_bus_name   = module.platform.event_bus_name
  }
}
