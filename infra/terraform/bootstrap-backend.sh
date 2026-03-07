#!/usr/bin/env bash
###############################################################################
# Vaidyah Platform - Terraform Backend Bootstrap
#
# Creates the S3 bucket and DynamoDB table required by the Terraform S3 backend
# before the first `terraform init`. Run this ONCE per AWS account.
#
# Prerequisites:
#   - AWS CLI v2 configured with credentials that can create S3 + DynamoDB
#   - Target region: ap-south-1 (Mumbai)
#
# Usage:
#   chmod +x bootstrap-backend.sh
#   ./bootstrap-backend.sh
###############################################################################
set -euo pipefail

REGION="ap-south-1"
BUCKET="vaidyah-terraform-state"
TABLE="vaidyah-terraform-locks"

echo "==> Bootstrapping Terraform backend in ${REGION}..."

# ---- S3 Bucket ----
if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null; then
  echo "    S3 bucket '${BUCKET}' already exists — skipping."
else
  echo "    Creating S3 bucket '${BUCKET}'..."
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"

  # Enable versioning (protects against accidental state deletion)
  aws s3api put-bucket-versioning \
    --bucket "$BUCKET" \
    --versioning-configuration Status=Enabled

  # Enable server-side encryption (AES-256)
  aws s3api put-bucket-encryption \
    --bucket "$BUCKET" \
    --server-side-encryption-configuration '{
      "Rules": [
        {
          "ApplyServerSideEncryptionByDefault": {
            "SSEAlgorithm": "AES256"
          },
          "BucketKeyEnabled": true
        }
      ]
    }'

  # Block all public access
  aws s3api put-public-access-block \
    --bucket "$BUCKET" \
    --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

  echo "    S3 bucket created with versioning + encryption + public-access block."
fi

# ---- DynamoDB Lock Table ----
if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "    DynamoDB table '${TABLE}' already exists — skipping."
else
  echo "    Creating DynamoDB table '${TABLE}'..."
  aws dynamodb create-table \
    --table-name "$TABLE" \
    --region "$REGION" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --tags Key=Project,Value=vaidyah Key=ManagedBy,Value=bootstrap

  aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
  echo "    DynamoDB table created."
fi

echo ""
echo "==> Bootstrap complete. You can now run:"
echo "    cd infra/terraform"
echo "    terraform init"
echo "    terraform plan -var-file=environments/dev.tfvars"
