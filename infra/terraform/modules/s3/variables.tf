variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for server-side encryption"
  type        = string
}

variable "cors_allowed_origins" {
  description = "Allowed origins for S3 CORS configuration"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "logging_bucket_name" {
  description = "Name of the S3 bucket for access logging. If empty, a logging bucket will be created."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
