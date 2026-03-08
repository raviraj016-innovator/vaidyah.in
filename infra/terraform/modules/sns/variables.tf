###############################################################################
# Vaidyah Healthcare Platform - SNS Module Variables
###############################################################################

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

variable "kms_key_id" {
  description = "KMS key ID for encrypting SNS topics"
  type        = string
  default     = ""
}

# ── Push Notification Platform Credentials ─────────────────────────────────

variable "apns_platform_credential" {
  description = "APNS platform credential (push certificate private key). Empty to skip iOS setup."
  type        = string
  default     = ""
  sensitive   = true
}

variable "apns_platform_principal" {
  description = "APNS platform principal (push certificate). Empty to skip iOS setup."
  type        = string
  default     = ""
  sensitive   = true
}

variable "gcm_api_key" {
  description = "GCM/FCM API key for Android push notifications. Empty to skip Android setup."
  type        = string
  default     = ""
  sensitive   = true
}

# ── SMS Configuration ────────────────────────────────────────────────────

variable "sms_monthly_spend_limit" {
  description = "Monthly spending limit for SMS in USD"
  type        = number
  default     = 1
}

variable "sms_usage_report_bucket" {
  description = "S3 bucket name for SMS usage reports. Empty to skip."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
