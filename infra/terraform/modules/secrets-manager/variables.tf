###############################################################################
# Vaidyah Healthcare Platform - Secrets Manager Module Variables
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
  description = "KMS key ARN for encrypting secrets"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for restricting secret access"
  type        = string
}

# ── Database Configuration ─────────────────────────────────────────────────

variable "db_master_username" {
  description = "RDS master username"
  type        = string
  default     = "vaidyah_admin"
  sensitive   = true
}

variable "db_host" {
  description = "RDS host endpoint"
  type        = string
  default     = ""
}

variable "db_port" {
  description = "RDS port"
  type        = number
  default     = 5432
}

variable "db_name" {
  description = "RDS database name"
  type        = string
  default     = "vaidyah"
}

# ── Rotation Configuration ─────────────────────────────────────────────────

variable "enable_rotation" {
  description = "Enable automatic rotation for the DB password secret"
  type        = bool
  default     = false
}

variable "rotation_lambda_arn" {
  description = "ARN of the Lambda function for secret rotation"
  type        = string
  default     = ""
}

# ── External API Keys (passed securely, stored in Secrets Manager) ─────────

variable "openai_api_key" {
  description = "OpenAI API key for NLU service"
  type        = string
  default     = ""
  sensitive   = true
}

variable "abdm_client_id" {
  description = "ABDM (Ayushman Bharat Digital Mission) client ID"
  type        = string
  default     = ""
  sensitive   = true
}

variable "abdm_client_secret" {
  description = "ABDM client secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "abdm_api_key" {
  description = "ABDM API key for integration service"
  type        = string
  default     = ""
  sensitive   = true
}

variable "clinical_trials_api_key" {
  description = "ClinicalTrials.gov API key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "sms_gateway_api_key" {
  description = "SMS gateway API key for notifications"
  type        = string
  default     = ""
  sensitive   = true
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
