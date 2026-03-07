variable "project_name" {
  type        = string
  description = "Project name used for resource naming"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where the RDS instance will be deployed"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for the DB subnet group"
}

variable "eks_security_group_id" {
  type        = string
  description = "Security group ID of EKS worker nodes allowed to connect"
}

variable "instance_class" {
  type        = string
  description = "RDS instance class"
}

variable "allocated_storage" {
  type        = number
  description = "Allocated storage in GiB"
}

variable "max_allocated_storage" {
  type        = number
  description = "Maximum storage in GiB for autoscaling"
}

variable "multi_az" {
  type        = bool
  description = "Enable Multi-AZ deployment"
}

variable "backup_retention" {
  type        = number
  description = "Number of days to retain automated backups"
}

variable "database_name" {
  type        = string
  description = "Name of the default database"
}

variable "master_username" {
  type        = string
  description = "Master username for the database"
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key ARN for storage encryption"
}

variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
}
