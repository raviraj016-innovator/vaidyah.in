###############################################################################
# Vaidyah Healthcare Platform - CloudWatch Module Variables
###############################################################################

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for encrypting CloudWatch log groups"
  type        = string
  default     = ""
}

# ── Alarm Configuration ──────────────────────────────────────────────────

variable "error_rate_threshold" {
  description = "Error count threshold (per 5 min) before alarm triggers"
  type        = number
  default     = 10
}

variable "latency_threshold_ms" {
  description = "p99 latency threshold in milliseconds before alarm triggers"
  type        = number
  default     = 5000
}

variable "alarm_sns_topic_arns" {
  description = "SNS topic ARNs for alarm notifications (warning level)"
  type        = list(string)
  default     = []
}

variable "critical_alarm_sns_topic_arns" {
  description = "SNS topic ARNs for critical alarm notifications"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
