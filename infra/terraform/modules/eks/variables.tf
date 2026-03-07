variable "project_name" {
  type        = string
  description = "Project name used for resource naming"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
}

variable "cluster_version" {
  type        = string
  description = "Kubernetes version for the EKS cluster"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where the EKS cluster will be deployed"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for the EKS cluster and node groups"
}

variable "node_instance_types" {
  type        = list(string)
  description = "EC2 instance types for the EKS managed node group"
}

variable "node_desired_size" {
  type        = number
  description = "Desired number of worker nodes"
}

variable "node_min_size" {
  type        = number
  description = "Minimum number of worker nodes"
}

variable "node_max_size" {
  type        = number
  description = "Maximum number of worker nodes"
}

variable "node_disk_size" {
  type        = number
  description = "Disk size in GiB for worker nodes"
}

variable "endpoint_public_access" {
  type        = bool
  description = "Enable public access to the EKS API endpoint (restricted by public_access_cidrs). Defaults to false for security."
  default     = false
}

variable "public_access_cidrs" {
  type        = list(string)
  description = "CIDR blocks allowed to access the EKS API endpoint when public access is enabled"
  default     = []  # Empty = no public access; set to your CI/CD or admin IP ranges
}

variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
}
