###############################################################################
# Vaidyah Healthcare Platform - Root Outputs
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

# ── EKS Outputs ──────────────────────────────────────────────────────────────

output "eks_cluster_name" {
  description = "Name of the EKS cluster"
  value       = module.eks.cluster_id
}

output "eks_cluster_endpoint" {
  description = "Endpoint URL for the EKS cluster API server"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "eks_cluster_oidc_issuer_url" {
  description = "OIDC issuer URL for the EKS cluster"
  value       = module.eks.cluster_oidc_issuer_url
}

output "eks_node_role_arn" {
  description = "ARN of the EKS node IAM role"
  value       = module.eks.node_role_arn
}

output "eks_kubeconfig_command" {
  description = "Command to update kubeconfig for EKS cluster access"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_id}"
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

# ── DynamoDB Outputs ─────────────────────────────────────────────────────────

output "dynamodb_sessions_table_name" {
  description = "Name of the DynamoDB sessions table"
  value       = module.dynamodb.sessions_table_name
}

output "dynamodb_sessions_table_arn" {
  description = "ARN of the DynamoDB sessions table"
  value       = module.dynamodb.sessions_table_arn
}

output "dynamodb_voice_chunks_table_name" {
  description = "Name of the DynamoDB voice_chunks table"
  value       = module.dynamodb.voice_chunks_table_name
}

output "dynamodb_voice_chunks_table_arn" {
  description = "ARN of the DynamoDB voice_chunks table"
  value       = module.dynamodb.voice_chunks_table_arn
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

output "s3_voice_recordings_bucket_arn" {
  description = "ARN of the voice recordings S3 bucket"
  value       = module.s3.voice_bucket_arn
}

output "s3_documents_bucket_arn" {
  description = "ARN of the documents S3 bucket"
  value       = module.s3.documents_bucket_arn
}

output "s3_medical_images_bucket_arn" {
  description = "ARN of the medical images S3 bucket"
  value       = module.s3.images_bucket_arn
}

# ── OpenSearch Outputs ───────────────────────────────────────────────────────

output "opensearch_endpoint" {
  description = "OpenSearch domain endpoint"
  value       = module.opensearch.domain_endpoint
  sensitive   = true
}

output "opensearch_domain_id" {
  description = "OpenSearch domain ID"
  value       = module.opensearch.domain_id
}

output "opensearch_domain_arn" {
  description = "ARN of the OpenSearch domain"
  value       = module.opensearch.domain_arn
}

# ── Cognito Outputs ──────────────────────────────────────────────────────────

output "cognito_providers_user_pool_id" {
  description = "ID of the healthcare providers Cognito user pool"
  value       = module.cognito.providers_user_pool_id
}

output "cognito_patients_user_pool_id" {
  description = "ID of the patients Cognito user pool"
  value       = module.cognito.patients_user_pool_id
}

output "cognito_providers_client_id" {
  description = "App client ID for healthcare providers pool"
  value       = module.cognito.providers_client_id
  sensitive   = true
}

output "cognito_patients_client_id" {
  description = "App client ID for patients pool"
  value       = module.cognito.patients_client_id
  sensitive   = true
}

# ── API Gateway Outputs ──────────────────────────────────────────────────────

output "api_gateway_rest_api_id" {
  description = "ID of the API Gateway REST API"
  value       = module.api_gateway.api_id
}

output "api_gateway_invoke_urls" {
  description = "Invoke URLs for each API Gateway stage"
  value       = module.api_gateway.stage_invoke_urls
}

# ── KMS Outputs ──────────────────────────────────────────────────────────────

output "kms_key_arn" {
  description = "ARN of the KMS encryption key"
  value       = aws_kms_key.main.arn
}
