###############################################################################
# Vaidyah Healthcare Platform - KMS Module Variables
###############################################################################

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

variable "admin_role_arns" {
  description = "List of IAM role ARNs allowed to administer the KMS key"
  type        = list(string)
  default     = []
}

variable "service_role_arns" {
  description = "List of IAM role ARNs allowed to use the KMS key for encrypt/decrypt"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
