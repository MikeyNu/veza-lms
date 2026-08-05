resource "aws_wafv2_web_acl" "main" {
  name        = "${local.name}-waf"
  description = "Veza ${var.environment} application protection"
  scope       = "REGIONAL"

  default_action { allow {} }

  rule {
    name     = "aws-common-rule-set"
    priority = 10
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-known-bad-inputs"
    priority = 20
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "request-rate-limit"
    priority = 30
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 3000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-waf"
    sampled_requests_enabled   = true
  }

  tags = local.common_tags
}

resource "aws_wafv2_web_acl_association" "main" {
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${local.name}-media"
  description                       = "Private access to tenant media"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_cache_policy" "application" {
  name        = "${local.name}-application"
  default_ttl = 0
  max_ttl     = 60
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config { cookie_behavior = "all" }
    headers_config {
      header_behavior = "whitelist"
      headers { items = ["Authorization", "Origin", "Accept", "Content-Type"] }
    }
    query_strings_config { query_string_behavior = "all" }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_origin_request_policy" "application" {
  name = "${local.name}-application"
  cookies_config { cookie_behavior = "all" }
  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [
        "Authorization",
        "Origin",
        "Accept",
        "Content-Type",
        "CloudFront-Viewer-Country",
        "X-Forwarded-Host"
      ]
    }
  }
  query_strings_config { query_string_behavior = "all" }
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Veza ${var.environment} edge"
  default_root_object = ""
  price_class         = "PriceClass_200"
  aliases             = var.domain_name == null ? [] : [var.domain_name]

  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "application"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = var.cloudfront_certificate_arn == null ? "http-only" : "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "media"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id       = "application"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    cache_policy_id          = aws_cloudfront_cache_policy.application.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.application.id
  }

  ordered_cache_behavior {
    path_pattern           = "/tenants/*"
    target_origin_id       = "media"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.domain_name == null
    acm_certificate_arn            = var.domain_name == null ? null : var.cloudfront_certificate_arn
    ssl_support_method             = var.domain_name == null ? null : "sni-only"
    minimum_protocol_version       = var.domain_name == null ? "TLSv1" : "TLSv1.2_2021"
  }

  logging_config {
    bucket          = aws_s3_bucket.logs.bucket_domain_name
    include_cookies = false
    prefix          = "cloudfront/"
  }

  tags = local.common_tags
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "CloudFrontRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.media.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
        }
      }
    }]
  })
}

resource "aws_route53_record" "application" {
  count = var.domain_name != null && var.hosted_zone_id != null ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}
