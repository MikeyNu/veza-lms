variable "media_cloudfront_public_key" {
  description = "PEM-encoded public key used by CloudFront to validate media signed URLs."
  type        = string
  default     = null
  nullable    = true
  sensitive   = true
}

variable "media_cloudfront_private_key_secret_arn" {
  description = "Secrets Manager ARN containing the base64-encoded private key used by the API."
  type        = string
  default     = null
  nullable    = true
}

resource "aws_cloudfront_public_key" "media" {
  count = var.media_cloudfront_public_key == null ? 0 : 1

  name        = "${local.name}-media"
  comment     = "Veza ${var.environment} media signed URL verification"
  encoded_key = var.media_cloudfront_public_key
}

resource "aws_cloudfront_key_group" "media" {
  count = var.media_cloudfront_public_key == null ? 0 : 1

  name    = "${local.name}-media"
  comment = "Veza ${var.environment} trusted media signers"
  items   = [aws_cloudfront_public_key.media[0].id]
}
