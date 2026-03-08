###############################################################################
# Vaidyah Healthcare Platform - Secrets Manager Module
# Manages application secrets with automatic rotation and VPC-restricted access.
###############################################################################

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  account_id  = data.aws_caller_identity.current.account_id
  partition   = data.aws_partition.current.partition
}

# ── Application Secrets ────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "${local.name_prefix}/app-secrets"
  description             = "Application secrets for Vaidyah ${var.environment} environment"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.environment == "prod" ? 30 : 7

  tags = merge(var.tags, {
    Name               = "${local.name_prefix}-app-secrets"
    DataClassification = "sensitive"
  })
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    JWT_SECRET          = random_password.jwt_secret.result
    ENCRYPTION_KEY      = random_password.encryption_key.result
    OPENAI_API_KEY      = var.openai_api_key
    ABDM_CLIENT_ID      = var.abdm_client_id
    ABDM_CLIENT_SECRET  = var.abdm_client_secret
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ── Database Password Secret ──────────────────────────────────────────────

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${local.name_prefix}/rds/master-password"
  description             = "RDS master password for ${local.name_prefix}"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.environment == "prod" ? 30 : 7

  tags = merge(var.tags, {
    Name               = "${local.name_prefix}-db-password"
    DataClassification = "critical"
    RotationEnabled    = "true"
  })
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({
    username = var.db_master_username
    password = random_password.db_password.result
    engine   = "postgres"
    host     = var.db_host
    port     = var.db_port
    dbname   = var.db_name
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ── Secret Rotation (30-day rotation for DB password) ─────────────────────

resource "aws_secretsmanager_secret_rotation" "db_password" {
  count = var.enable_rotation ? 1 : 0

  secret_id           = aws_secretsmanager_secret.db_password.id
  rotation_lambda_arn = var.rotation_lambda_arn

  rotation_rules {
    automatically_after_days = 30
  }
}

# ── API Keys Secret ──────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "api_keys" {
  name                    = "${local.name_prefix}/api-keys"
  description             = "External API keys for integrations (ABDM, ClinicalTrials.gov, etc.)"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.environment == "prod" ? 30 : 7

  tags = merge(var.tags, {
    Name               = "${local.name_prefix}-api-keys"
    DataClassification = "sensitive"
  })
}

resource "aws_secretsmanager_secret_version" "api_keys" {
  secret_id = aws_secretsmanager_secret.api_keys.id
  secret_string = jsonencode({
    CLINICAL_TRIALS_API_KEY = var.clinical_trials_api_key
    ABDM_API_KEY            = var.abdm_api_key
    SMS_GATEWAY_API_KEY     = var.sms_gateway_api_key
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ── Random Password Generation ────────────────────────────────────────────

resource "random_password" "jwt_secret" {
  length           = 64
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "random_password" "encryption_key" {
  length           = 32
  special          = false
}

resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# ── Resource Policy - Restrict Access to VPC ──────────────────────────────

resource "aws_secretsmanager_secret_policy" "app_secrets" {
  secret_arn = aws_secretsmanager_secret.app_secrets.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RestrictToVPC"
        Effect = "Deny"
        Principal = {
          AWS = "*"
        }
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "*"
        Condition = {
          StringNotEquals = {
            "aws:sourceVpc" = var.vpc_id
          }
          # Exclude the root account and deployment roles from VPC restriction
          ArnNotLike = {
            "aws:PrincipalArn" = [
              "arn:${local.partition}:iam::${local.account_id}:root",
              "arn:${local.partition}:iam::${local.account_id}:role/${var.project_name}-*-deploy-*"
            ]
          }
        }
      }
    ]
  })
}

resource "aws_secretsmanager_secret_policy" "db_password" {
  secret_arn = aws_secretsmanager_secret.db_password.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RestrictToVPC"
        Effect = "Deny"
        Principal = {
          AWS = "*"
        }
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "*"
        Condition = {
          StringNotEquals = {
            "aws:sourceVpc" = var.vpc_id
          }
          ArnNotLike = {
            "aws:PrincipalArn" = [
              "arn:${local.partition}:iam::${local.account_id}:root",
              "arn:${local.partition}:iam::${local.account_id}:role/${var.project_name}-*-deploy-*"
            ]
          }
        }
      }
    ]
  })
}

resource "aws_secretsmanager_secret_policy" "api_keys" {
  secret_arn = aws_secretsmanager_secret.api_keys.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RestrictToVPC"
        Effect = "Deny"
        Principal = {
          AWS = "*"
        }
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "*"
        Condition = {
          StringNotEquals = {
            "aws:sourceVpc" = var.vpc_id
          }
          ArnNotLike = {
            "aws:PrincipalArn" = [
              "arn:${local.partition}:iam::${local.account_id}:root",
              "arn:${local.partition}:iam::${local.account_id}:role/${var.project_name}-*-deploy-*"
            ]
          }
        }
      }
    ]
  })
}
