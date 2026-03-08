###############################################################################
# Vaidyah Healthcare Platform - Budget Deployment Outputs
###############################################################################

# ── VPC Outputs ──────────────────────────────────────────────────────────────

output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = module.vpc.private_subnet_ids
}

# ── EC2 Outputs ──────────────────────────────────────────────────────────────

output "ec2_instance_id" {
  description = "ID of the application EC2 instance"
  value       = aws_instance.app.id
}

output "ec2_public_ip" {
  description = "Elastic IP of the application server"
  value       = aws_eip.app.public_ip
}

output "ec2_ssh_command" {
  description = "SSH command to connect to the application server"
  value       = var.ec2_key_pair_name != "" ? "ssh -i ${var.ec2_key_pair_name}.pem ec2-user@${aws_eip.app.public_ip}" : "No key pair configured"
}

# ── RDS Outputs ──────────────────────────────────────────────────────────────

output "rds_endpoint" {
  description = "RDS instance endpoint (host:port)"
  value       = module.rds.db_endpoint
  sensitive   = true
}

output "rds_connection_string" {
  description = "PostgreSQL connection string (password not included)"
  value       = "postgresql://${var.rds_master_username}:<password>@${module.rds.db_endpoint}/${var.rds_database_name}"
  sensitive   = true
}

output "rds_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the database password"
  value       = module.rds.db_secret_arn
}

# ── S3 Outputs ───────────────────────────────────────────────────────────────

output "s3_voice_recordings_bucket" {
  description = "Name of the voice recordings S3 bucket"
  value       = module.s3.voice_bucket_name
}

output "s3_documents_bucket" {
  description = "Name of the documents S3 bucket"
  value       = module.s3.documents_bucket_name
}

output "s3_medical_images_bucket" {
  description = "Name of the medical images S3 bucket"
  value       = module.s3.images_bucket_name
}

# ── KMS Outputs ──────────────────────────────────────────────────────────────

output "kms_phi_key_arn" {
  description = "ARN of the PHI encryption KMS key"
  value       = module.kms.phi_key_arn
}

# ── Secrets Manager Outputs ──────────────────────────────────────────────────

output "secrets_manager_app_secrets_arn" {
  description = "ARN of the application secrets in Secrets Manager"
  value       = module.secrets_manager.app_secrets_arn
}

# ── SNS Outputs ──────────────────────────────────────────────────────────────

output "sns_emergency_alerts_topic_arn" {
  description = "ARN of the emergency alerts SNS topic"
  value       = module.sns.emergency_alerts_topic_arn
}

output "sns_system_alerts_topic_arn" {
  description = "ARN of the system alerts SNS topic"
  value       = module.sns.system_alerts_topic_arn
}

# ── ECR Outputs ──────────────────────────────────────────────────────────────

output "ecr_repository_urls" {
  description = "Map of service names to ECR repository URLs"
  value       = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}

# ── CloudWatch Outputs ───────────────────────────────────────────────────────

output "cloudwatch_dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = module.cloudwatch.dashboard_name
}
