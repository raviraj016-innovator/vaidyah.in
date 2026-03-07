###############################################################################
# Vaidyah Healthcare Platform - Root Module
###############################################################################

locals {
  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.additional_tags
  )

  name_prefix = "${var.project_name}-${var.environment}"
}

# ── Data Sources ─────────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

# ── KMS Key for Encryption ──────────────────────────────────────────────────

resource "aws_kms_key" "main" {
  description             = "Vaidyah ${var.environment} encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootAccountAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowEKSNodeAccess"
        Effect = "Allow"
        Principal = {
          AWS = module.eks.node_role_arn
        }
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:Encrypt",
          "kms:GenerateDataKey*",
          "kms:ReEncrypt*"
        ]
        Resource = "*"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.name_prefix}-key"
  target_key_id = aws_kms_key.main.key_id
}

# ── VPC ──────────────────────────────────────────────────────────────────────

module "vpc" {
  source = "./modules/vpc"

  project_name         = var.project_name
  environment          = var.environment
  vpc_cidr             = var.vpc_cidr
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  availability_zones   = var.availability_zones
  tags                 = local.common_tags
}

# ── EKS ──────────────────────────────────────────────────────────────────────

module "eks" {
  source = "./modules/eks"

  project_name        = var.project_name
  environment         = var.environment
  cluster_version     = var.eks_cluster_version
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  node_instance_types = var.eks_node_instance_types
  node_desired_size   = var.eks_node_desired_size
  node_min_size       = var.eks_node_min_size
  node_max_size       = var.eks_node_max_size
  node_disk_size      = var.eks_node_disk_size
  tags                = local.common_tags
}

# ── RDS PostgreSQL ───────────────────────────────────────────────────────────

module "rds" {
  source = "./modules/rds"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  eks_security_group_id = module.eks.node_security_group_id
  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  multi_az              = var.rds_multi_az
  backup_retention      = var.rds_backup_retention_period
  database_name         = var.rds_database_name
  master_username       = var.rds_master_username
  kms_key_arn           = aws_kms_key.main.arn
  tags                  = local.common_tags
}

# ── DynamoDB ─────────────────────────────────────────────────────────────────

module "dynamodb" {
  source = "./modules/dynamodb"

  project_name = var.project_name
  environment  = var.environment
  kms_key_arn  = aws_kms_key.main.arn
  tags         = local.common_tags
}

# ── S3 Buckets ───────────────────────────────────────────────────────────────

module "s3" {
  source = "./modules/s3"

  project_name         = var.project_name
  environment          = var.environment
  kms_key_arn          = aws_kms_key.main.arn
  cors_allowed_origins = var.environment == "prod" ? ["https://api.vaidyah.health", "https://admin.vaidyah.health", "https://app.vaidyah.health"] : ["http://localhost:3000"]
  tags                 = local.common_tags
}

# ── OpenSearch ───────────────────────────────────────────────────────────────

module "opensearch" {
  source = "./modules/opensearch"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  eks_security_group_id = module.eks.node_security_group_id
  opensearch_access_role_arns = [module.eks.node_role_arn]
  instance_type              = var.opensearch_instance_type
  instance_count     = var.opensearch_instance_count
  volume_size        = var.opensearch_volume_size
  engine_version     = var.opensearch_engine_version
  kms_key_arn        = aws_kms_key.main.arn
  tags               = local.common_tags
}

# ── Cognito ──────────────────────────────────────────────────────────────────

module "cognito" {
  source = "./modules/cognito"

  project_name = var.project_name
  environment  = var.environment
  tags         = local.common_tags
}

# ── ElastiCache (Redis) ──────────────────────────────────────────────

module "elasticache" {
  source = "./modules/elasticache"

  project_name           = var.project_name
  environment            = var.environment
  vpc_id                 = module.vpc.vpc_id
  private_subnet_ids     = module.vpc.private_subnet_ids
  app_security_group_ids = [module.eks.node_security_group_id]
  node_type              = var.environment == "prod" ? "cache.r6g.large" : "cache.t3.micro"
  auth_token             = var.redis_auth_token
  tags                   = local.common_tags
}

# ── API Gateway ──────────────────────────────────────────────────────────────

module "api_gateway" {
  source = "./modules/api-gateway"

  project_name    = var.project_name
  environment     = var.environment
  stage_names     = var.api_gateway_stage_names
  domain_name     = var.domain_name
  certificate_arn = var.certificate_arn
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  cognito_user_pool_arns = [
    module.cognito.providers_user_pool_arn,
    module.cognito.patients_user_pool_arn
  ]
  cognito_client_ids = [
    module.cognito.providers_client_id,
    module.cognito.patients_client_id
  ]
  tags = local.common_tags
}
