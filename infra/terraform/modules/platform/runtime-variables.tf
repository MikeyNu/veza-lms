variable "service_environment" {
  description = "Additional non-secret environment variables by service name."
  type        = map(map(string))
  default     = {}
}

variable "service_secrets" {
  description = "Secrets Manager or SSM parameter ARNs mapped to environment names by service."
  type        = map(map(string))
  default     = {}
}
