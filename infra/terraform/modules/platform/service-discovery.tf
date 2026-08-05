resource "aws_vpc_security_group_ingress_rule" "application_api" {
  security_group_id            = aws_security_group.application.id
  description                  = "Private application services to API"
  from_port                    = local.services.api.port
  to_port                      = local.services.api.port
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.application.id
}

resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${local.name}.internal"
  description = "Private Veza ${var.environment} service discovery"
  vpc         = aws_vpc.main.id
  tags        = local.common_tags
}

resource "aws_service_discovery_service" "api" {
  name = "api"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"

    dns_records {
      ttl  = 10
      type = "A"
    }
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = local.common_tags
}
