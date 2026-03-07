variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for OpenSearch deployment"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for OpenSearch VPC deployment"
  type        = list(string)
}

variable "eks_security_group_id" {
  description = "Security group ID of EKS worker nodes"
  type        = string
}

variable "instance_type" {
  description = "OpenSearch instance type"
  type        = string
  default     = "t3.medium.search"
}

variable "instance_count" {
  description = "Number of OpenSearch data nodes"
  type        = number
  default     = 2
}

variable "volume_size" {
  description = "EBS volume size in GB"
  type        = number
  default     = 20
}

variable "engine_version" {
  description = "OpenSearch engine version"
  type        = string
  default     = "OpenSearch_2.11"
}

variable "kms_key_arn" {
  description = "KMS key ARN for encryption at rest"
  type        = string
}

variable "opensearch_access_role_arns" {
  description = "List of IAM role ARNs allowed to access the OpenSearch domain"
  type        = list(string)
}

variable "dedicated_master_enabled" {
  description = "Whether dedicated master nodes are enabled for the cluster"
  type        = bool
  default     = true
}

variable "dedicated_master_type" {
  description = "Instance type for dedicated master nodes"
  type        = string
  default     = "t3.small.search"
}

variable "dedicated_master_count" {
  description = "Number of dedicated master nodes (must be odd: 3 or 5)"
  type        = number
  default     = 3
}

variable "create_service_linked_role" {
  description = "Whether to create the OpenSearch service-linked role"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
