###############################################################################
# Vaidyah Healthcare Platform - Budget Deployment Variables
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

# ── EC2 ──────────────────────────────────────────────────────────────────────

variable "ec2_instance_type" {
  description = "EC2 instance type for the application server"
  type        = string
  default     = "t3.small"
}

variable "ec2_key_pair_name" {
  description = "Name of the EC2 key pair for SSH access"
  type        = string
  default     = ""
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH into the EC2 instance"
  type        = list(string)
  default     = []
}

# ── RDS ──────────────────────────────────────────────────────────────────────

variable "rds_instance_class" {
  description = "RDS instance class (budget: db.t3.micro)"
  type        = string
  default     = "db.t3.micro"
}

variable "rds_allocated_storage" {
  description = "Allocated storage in GB for RDS"
  type        = number
  default     = 20
}

variable "rds_max_allocated_storage" {
  description = "Maximum storage autoscaling limit in GB"
  type        = number
  default     = 50
}

variable "rds_backup_retention_period" {
  description = "Number of days to retain automated RDS backups"
  type        = number
  default     = 3
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

# ── S3 / CORS ───────────────────────────────────────────────────────────────

variable "cors_allowed_origins" {
  description = "CORS allowed origins for S3 buckets"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

# ── Tags ─────────────────────────────────────────────────────────────────────

variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
