data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  name = "${var.name_prefix}-${var.environment}"
  azs  = length(var.availability_zones) >= 2 ? slice(var.availability_zones, 0, 2) : slice(data.aws_availability_zones.available.names, 0, 2)

  services = {
    api = {
      port        = 4000
      health_path = "/v1/health/ready"
      public      = true
    }
    web = {
      port        = 3000
      health_path = "/"
      public      = true
    }
    control-plane = {
      port        = 3001
      health_path = "/sign-in"
      public      = true
    }
    worker = {
      port        = 0
      health_path = null
      public      = false
    }
  }

  public_subnets = {
    for index, az in local.azs : az => cidrsubnet(var.vpc_cidr, 4, index)
  }
  private_subnets = {
    for index, az in local.azs : az => cidrsubnet(var.vpc_cidr, 4, index + 4)
  }
  data_subnets = {
    for index, az in local.azs : az => cidrsubnet(var.vpc_cidr, 4, index + 8)
  }
  nat_keys = var.enable_nat_per_az ? toset(local.azs) : toset([local.azs[0]])

  common_tags = merge({
    Product     = "Veza Learning Cloud"
    Environment = var.environment
    ManagedBy   = "Terraform"
    DataPlane   = "multi-tenant"
  }, var.tags)
}
