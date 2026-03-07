###############################################################################
# Vaidyah Healthcare Platform - API Gateway Module Variables
###############################################################################

variable "project_name" {
  description = "Name of the project, used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "stage_names" {
  description = "List of API Gateway stage names to create"
  type        = list(string)
  default     = ["dev", "staging", "prod"]
}

variable "domain_name" {
  description = "Custom domain name for API Gateway (leave empty to skip)"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN for custom domain TLS termination"
  type        = string
  default     = ""
}

variable "cognito_user_pool_arns" {
  description = "List of Cognito User Pool ARNs for JWT authorization"
  type        = list(string)
}

variable "vpc_id" {
  description = "VPC ID for the VPC Link security group"
  type        = string
  default     = ""
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the VPC Link"
  type        = list(string)
  default     = []
}

variable "eks_security_group_id" {
  description = "Security group ID of EKS nodes for VPC Link traffic"
  type        = string
  default     = ""
}

variable "cognito_client_ids" {
  description = "Cognito app client IDs for JWT audience validation"
  type        = list(string)
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
