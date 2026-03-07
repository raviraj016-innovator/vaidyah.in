###############################################################################
# Vaidyah Healthcare Platform - Root Variables
###############################################################################

variable "project_name" {
  description = "Name of the project, used for resource naming and tagging"
  type        = string
  default     = "vaidyah"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "ap-south-1"
}

# ── Networking ───────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.20.0/24"]
}

variable "availability_zones" {
  description = "List of availability zones to deploy into"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

# ── EKS ──────────────────────────────────────────────────────────────────────

variable "eks_cluster_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.29"
}

variable "eks_node_instance_types" {
  description = "Instance types for EKS managed node group"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "eks_node_desired_size" {
  description = "Desired number of worker nodes"
  type        = number
  default     = 2
}

variable "eks_node_min_size" {
  description = "Minimum number of worker nodes"
  type        = number
  default     = 1
}

variable "eks_node_max_size" {
  description = "Maximum number of worker nodes"
  type        = number
  default     = 5
}

variable "eks_node_disk_size" {
  description = "EBS volume size in GB for worker nodes"
  type        = number
  default     = 50
}

# ── RDS ──────────────────────────────────────────────────────────────────────

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "rds_allocated_storage" {
  description = "Allocated storage in GB for RDS"
  type        = number
  default     = 20
}

variable "rds_max_allocated_storage" {
  description = "Maximum storage autoscaling limit in GB"
  type        = number
  default     = 100
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = false
}

variable "rds_backup_retention_period" {
  description = "Number of days to retain automated RDS backups"
  type        = number
  default     = 7
}

variable "rds_database_name" {
  description = "Name of the default database"
  type        = string
  default     = "vaidyah"
}

variable "rds_master_username" {
  description = "Master username for RDS"
  type        = string
  default     = "vaidyah_admin"
  sensitive   = true
}

# ── OpenSearch ───────────────────────────────────────────────────────────────

variable "opensearch_instance_type" {
  description = "Instance type for OpenSearch domain"
  type        = string
  default     = "t3.medium.search"
}

variable "opensearch_instance_count" {
  description = "Number of OpenSearch data nodes"
  type        = number
  default     = 2
}

variable "opensearch_volume_size" {
  description = "EBS volume size in GB for OpenSearch"
  type        = number
  default     = 20
}

variable "opensearch_engine_version" {
  description = "OpenSearch engine version"
  type        = string
  default     = "OpenSearch_2.11"
}

# ── ElastiCache (Redis) ──────────────────────────────────────────────────────

variable "redis_auth_token" {
  description = "Auth token for Redis (must be 16-128 chars, transit encryption required)"
  type        = string
  sensitive   = true
  default     = ""
}

# ── API Gateway ──────────────────────────────────────────────────────────────

variable "api_gateway_stage_names" {
  description = "API Gateway stage names"
  type        = list(string)
  default     = ["dev", "staging", "prod"]
}

variable "domain_name" {
  description = "Custom domain name for API Gateway"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN for custom domain TLS"
  type        = string
  default     = ""
}

# ── Tags ─────────────────────────────────────────────────────────────────────

variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
