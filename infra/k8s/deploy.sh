#!/usr/bin/env bash
set -euo pipefail

: "${ENVIRONMENT:?ENVIRONMENT must be set}"
: "${AWS_ACCOUNT_ID:?AWS_ACCOUNT_ID must be set}"
: "${AWS_REGION:?AWS_REGION must be set}"
: "${IMAGE_TAG:?IMAGE_TAG must be set}"
: "${ACM_CERTIFICATE_ARN:?ACM_CERTIFICATE_ARN must be set}"
: "${WAF_WEB_ACL_ARN:=}"
: "${ALB_SECURITY_GROUP_ID:=}"
: "${OPENSEARCH_ENDPOINT:=}"
: "${DYNAMODB_TABLE_PREFIX:=}"

# Validate ENVIRONMENT to prevent injection
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
  echo "Error: ENVIRONMENT must be dev, staging, or prod" >&2
  exit 1
fi

# WAF is required for production deployments
if [[ "$ENVIRONMENT" == "prod" && -z "$WAF_WEB_ACL_ARN" ]]; then
  echo "Error: WAF_WEB_ACL_ARN is required for production deployments" >&2
  exit 1
fi

# Validate IMAGE_TAG format (prevent injection via tag)
if [[ ! "$IMAGE_TAG" =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo "Error: IMAGE_TAG contains invalid characters" >&2
  exit 1
fi

export ENVIRONMENT AWS_ACCOUNT_ID AWS_REGION IMAGE_TAG ACM_CERTIFICATE_ARN WAF_WEB_ACL_ARN ALB_SECURITY_GROUP_ID OPENSEARCH_ENDPOINT DYNAMODB_TABLE_PREFIX

# Only substitute explicitly listed variables (prevent secret leakage)
SUBST_VARS='${ENVIRONMENT} ${AWS_ACCOUNT_ID} ${AWS_REGION} ${IMAGE_TAG} ${ACM_CERTIFICATE_ARN} ${WAF_WEB_ACL_ARN} ${ALB_SECURITY_GROUP_ID} ${OPENSEARCH_ENDPOINT} ${DYNAMODB_TABLE_PREFIX}'

# Apply in explicit order: namespace first, then configs, then services
MANIFESTS=(
  namespace.yml
  secrets.yml
  configmap.yml
  service-account.yml
  network-policy.yml
  api-gateway.yml
  clinical-service.yml
  voice-service.yml
  nlu-service.yml
  trial-service.yml
  integration-service.yml
  admin-portal.yml
  ingress.yml
)

for f in "${MANIFESTS[@]}"; do
  if [[ -f "$f" ]]; then
    echo "Applying $f..."
    envsubst "$SUBST_VARS" < "$f" | kubectl apply -f -
  else
    echo "Warning: $f not found, skipping" >&2
  fi
done
