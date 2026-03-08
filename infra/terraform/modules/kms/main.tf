###############################################################################
# Vaidyah Healthcare Platform - KMS Module
# Customer-managed key for PHI encryption with automatic key rotation.
###############################################################################

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  account_id  = data.aws_caller_identity.current.account_id
  partition   = data.aws_partition.current.partition
  region      = data.aws_region.current.name
}

# ── Customer-Managed KMS Key for PHI Encryption ────────────────────────────

resource "aws_kms_key" "phi" {
  description             = "Vaidyah ${var.environment} PHI encryption key - customer-managed"
  deletion_window_in_days = var.environment == "prod" ? 30 : 14
  enable_key_rotation     = true
  is_enabled              = true
  multi_region            = false

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "${local.name_prefix}-phi-key-policy"
    Statement = concat(
      [
        # Root account full access
        {
          Sid    = "EnableRootAccountAccess"
          Effect = "Allow"
          Principal = {
            AWS = "arn:${local.partition}:iam::${local.account_id}:root"
          }
          Action   = "kms:*"
          Resource = "*"
        },
        # Key administrators
        {
          Sid    = "AllowKeyAdministration"
          Effect = "Allow"
          Principal = {
            AWS = var.admin_role_arns
          }
          Action = [
            "kms:Create*",
            "kms:Describe*",
            "kms:Enable*",
            "kms:List*",
            "kms:Put*",
            "kms:Update*",
            "kms:Revoke*",
            "kms:Disable*",
            "kms:Get*",
            "kms:Delete*",
            "kms:TagResource",
            "kms:UntagResource",
            "kms:ScheduleKeyDeletion",
            "kms:CancelKeyDeletion",
            "kms:ReplicateKey",
            "kms:ImportKeyMaterial"
          ]
          Resource = "*"
        },
        # Service roles - encrypt/decrypt
        {
          Sid    = "AllowServiceRolesUsage"
          Effect = "Allow"
          Principal = {
            AWS = var.service_role_arns
          }
          Action = [
            "kms:Decrypt",
            "kms:DescribeKey",
            "kms:Encrypt",
            "kms:GenerateDataKey",
            "kms:GenerateDataKeyWithoutPlaintext",
            "kms:ReEncryptFrom",
            "kms:ReEncryptTo"
          ]
          Resource = "*"
        },
        # Grant creation for service roles (needed for S3, RDS, etc.)
        {
          Sid    = "AllowServiceRolesGrantCreation"
          Effect = "Allow"
          Principal = {
            AWS = var.service_role_arns
          }
          Action = [
            "kms:CreateGrant",
            "kms:ListGrants",
            "kms:RevokeGrant"
          ]
          Resource = "*"
          Condition = {
            Bool = {
              "kms:GrantIsForAWSResource" = "true"
            }
          }
        }
      ],
      # Allow AWS services (RDS, S3, Secrets Manager, etc.) to use the key
      [
        {
          Sid    = "AllowAWSServicesUsage"
          Effect = "Allow"
          Principal = {
            Service = [
              "rds.amazonaws.com",
              "s3.amazonaws.com",
              "secretsmanager.amazonaws.com",
              "sns.amazonaws.com",
              "logs.${local.region}.amazonaws.com",
              "bedrock.amazonaws.com"
            ]
          }
          Action = [
            "kms:Decrypt",
            "kms:DescribeKey",
            "kms:Encrypt",
            "kms:GenerateDataKey",
            "kms:GenerateDataKeyWithoutPlaintext",
            "kms:ReEncryptFrom",
            "kms:ReEncryptTo"
          ]
          Resource = "*"
          Condition = {
            StringEquals = {
              "aws:SourceAccount" = local.account_id
            }
          }
        }
      ]
    )
  })

  tags = merge(var.tags, {
    Name               = "${local.name_prefix}-phi-key"
    DataClassification = "PHI"
    Compliance         = "HIPAA"
  })
}

resource "aws_kms_alias" "phi" {
  name          = "alias/vaidyah-phi-key"
  target_key_id = aws_kms_key.phi.key_id
}

resource "aws_kms_alias" "phi_env" {
  name          = "alias/${local.name_prefix}-phi-key"
  target_key_id = aws_kms_key.phi.key_id
}
