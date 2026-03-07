# Vaidyah Healthcare Platform - AWS Deployment Guide

Step-by-step guide to deploy the Vaidyah platform from zero to production on AWS (ap-south-1). Follow each step in order.

---

## Table of Contents

1. [Prerequisites](#step-1-prerequisites)
2. [AWS Account Preparation](#step-2-aws-account-preparation)
3. [Bootstrap Terraform Backend](#step-3-bootstrap-terraform-backend)
4. [Review Environment Configuration](#step-4-review-environment-configuration)
5. [Provision Infrastructure with Terraform](#step-5-provision-infrastructure-with-terraform)
6. [Configure EKS Cluster Access](#step-6-configure-eks-cluster-access)
7. [Install Cluster Add-Ons](#step-7-install-cluster-add-ons)
8. [Create ECR Repositories](#step-8-create-ecr-repositories)
9. [Build and Push Docker Images](#step-9-build-and-push-docker-images)
10. [Create Secrets in AWS Secrets Manager](#step-10-create-secrets-in-aws-secrets-manager)
11. [Deploy Kubernetes Manifests](#step-11-deploy-kubernetes-manifests)
12. [Configure DNS and TLS](#step-12-configure-dns-and-tls)
13. [Database Initialization](#step-13-database-initialization)
14. [Verify Deployment](#step-14-verify-deployment)
15. [Set Up CI/CD](#step-15-set-up-cicd)
16. [Post-Deployment Tasks](#step-16-post-deployment-tasks)
17. [Rollback Procedures](#step-17-rollback-procedures)

---

## Step 1: Prerequisites

### 1.1 Install Required Tools

| Tool | Version | Install |
|------|---------|---------|
| AWS CLI | v2 | https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html |
| Terraform | >= 1.6.0 | https://developer.hashicorp.com/terraform/install |
| kubectl | >= 1.29 | https://kubernetes.io/docs/tasks/tools/ |
| Docker | Latest | https://docs.docker.com/get-docker/ |
| Node.js | >= 20.0.0 | https://nodejs.org/ |
| Python | 3.11 | https://www.python.org/downloads/ |
| Helm | >= 3.0 | https://helm.sh/docs/intro/install/ |
| eksctl | Latest | https://eksctl.io/installation/ (needed for IRSA setup) |
| envsubst | (part of gettext) | Pre-installed on most Linux; `brew install gettext` on macOS |

Verify installations:

```bash
aws --version          # aws-cli/2.x.x
terraform --version    # Terraform v1.7.0+
kubectl version --client  # v1.29+
docker --version       # Docker 24+
node --version         # v20+
python3 --version      # 3.11+
helm version           # v3+
```

### 1.2 Clone the Repository

```bash
git clone <repository-url>
cd vaidyah_claude
```

### 1.3 Install Node.js Dependencies

```bash
npm install
```

### 1.4 Build Shared Packages

Other services depend on these, so build them first:

```bash
npx turbo run build --filter=@vaidyah/shared-types --filter=@vaidyah/medical-ontology
```

---

## Step 2: AWS Account Preparation

### 2.1 Configure AWS Credentials

```bash
aws configure
# AWS Access Key ID: <your-key>
# AWS Secret Access Key: <your-secret>
# Default region: ap-south-1
# Default output format: json
```

Or use SSO / IAM Identity Center:

```bash
aws configure sso
```

### 2.2 Verify Account Access

```bash
aws sts get-caller-identity
# Should return your account ID, ARN, and user ID
```

### 2.3 Enable Required AWS Services

Ensure these services are available in ap-south-1 (Mumbai):

- **Compute:** EKS, ECR, EC2
- **Database:** RDS (PostgreSQL), DynamoDB, ElastiCache (Redis)
- **Storage:** S3, OpenSearch Service
- **Security:** Cognito, KMS, Secrets Manager, WAF v2
- **AI/ML:** Bedrock (request Claude 3 Sonnet access), Transcribe Medical, Polly, Comprehend Medical, SageMaker
- **Networking:** VPC, Route53, API Gateway
- **Monitoring:** CloudWatch, SNS

**Important:** Request access to Amazon Bedrock foundation models (specifically `anthropic.claude-3-sonnet`) via the AWS Console > Bedrock > Model access. This may take 1-2 business days.

### 2.4 Create IAM Roles for Deployment

Create two IAM roles for GitHub Actions OIDC authentication:

**a) Terraform Role** (`vaidyah-terraform-role`):
- Trust policy: GitHub OIDC provider
- Permissions: AdministratorAccess (or scoped to Terraform-managed services)

**b) Deploy Role** (`vaidyah-deploy-role`):
- Trust policy: GitHub OIDC provider
- Permissions: ECR push, EKS describe/update, S3 read

```bash
# Set up GitHub OIDC provider (one-time)
aws iam create-open-id-connect-provider \
  --url "https://token.actions.githubusercontent.com" \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" \
  --client-id-list "sts.amazonaws.com"
```

---

## Step 3: Bootstrap Terraform Backend

This creates the S3 bucket and DynamoDB table used by Terraform to store state remotely. **Run this only once per AWS account.**

```bash
cd infra/terraform
chmod +x bootstrap-backend.sh
./bootstrap-backend.sh
```

This creates:
- **S3 bucket:** `vaidyah-terraform-state` (versioning + encryption + public access block)
- **DynamoDB table:** `vaidyah-terraform-locks` (state locking)

Verify:

```bash
aws s3api head-bucket --bucket vaidyah-terraform-state --region ap-south-1
aws dynamodb describe-table --table-name vaidyah-terraform-locks --region ap-south-1 --query 'Table.TableStatus'
```

---

## Step 4: Review Environment Configuration

### 4.1 Environment-Specific tfvars Files

Environment configurations already exist at `infra/terraform/environments/`. Each uses a separate VPC CIDR to allow peering between environments:

| Environment | VPC CIDR | AZs | File |
|-------------|----------|-----|------|
| dev | `10.10.0.0/16` | 1 (ap-south-1a) | `environments/dev/terraform.tfvars` |
| staging | `10.20.0.0/16` | 2 (a, b) | `environments/staging/terraform.tfvars` |
| prod | `10.30.0.0/16` | 3 (a, b, c) | `environments/prod/terraform.tfvars` |

Review the configuration for your target environment:

```bash
cat infra/terraform/environments/dev/terraform.tfvars
```

Key sizing differences across environments:

| Resource | Dev | Staging | Prod |
|----------|-----|---------|------|
| EKS nodes | t3.medium (2-4) | t3.large (2-6) | m6i.xlarge (3-12) |
| EKS disk | 30 GB | 50 GB | 100 GB |
| RDS | db.t3.medium, 20 GB | db.r6g.large, 50 GB | db.r6g.xlarge, 100 GB |
| RDS Multi-AZ | No | Yes | Yes |
| OpenSearch | t3.small (1 node, 10 GB) | m6g.large (2 nodes, 50 GB) | r6g.large (3 nodes, 100 GB) |
| Backups | 3 days | 7 days | 30 days |

### 4.2 Set Sensitive Variables

Create a `secrets.tfvars` file (do NOT commit this):

```hcl
redis_auth_token = "your-redis-auth-token-min-16-chars"
```

Note: `rds_master_username` is already set in the environment tfvars files (defaults to `vaidyah_admin`).

---

## Step 5: Provision Infrastructure with Terraform

### 5.1 Initialize Terraform

```bash
cd infra/terraform

# Initialize with the state backend key for your environment
terraform init \
  -backend-config="key=infrastructure/dev/terraform.tfstate"
```

### 5.2 Plan

```bash
terraform plan \
  -var-file="environments/dev/terraform.tfvars" \
  -var="environment=dev" \
  -var="redis_auth_token=your-redis-auth-token-min-16-chars" \
  -out="dev.tfplan"
```

Or if using a `secrets.tfvars` file:

```bash
terraform plan \
  -var-file="environments/dev/terraform.tfvars" \
  -var-file="secrets.tfvars" \
  -var="environment=dev" \
  -out="dev.tfplan"
```

Review the plan output carefully. It will create approximately:
- 1 VPC with subnets, NAT gateway, IGW
- 1 EKS cluster with managed node group
- 1 RDS PostgreSQL instance
- 2 DynamoDB tables (sessions, voice chunks)
- 3 S3 buckets (voice recordings, documents, medical images)
- 1 OpenSearch domain
- 2 Cognito user pools (providers + patients)
- 1 API Gateway HTTP API with WAF
- 1 KMS key with alias
- 1 ElastiCache Redis cluster

### 5.3 Apply

```bash
terraform apply "dev.tfplan"
```

**This takes 20-40 minutes** (EKS and OpenSearch are the slowest).

### 5.4 Save Terraform Outputs

```bash
# Export all outputs for later use
terraform output -json > ../../terraform-outputs.json

# Key values you'll need:
terraform output eks_cluster_name
terraform output rds_endpoint
terraform output opensearch_endpoint
terraform output cognito_providers_user_pool_id
terraform output cognito_patients_user_pool_id
terraform output cognito_providers_client_id
terraform output cognito_patients_client_id
terraform output s3_voice_recordings_bucket
terraform output s3_documents_bucket
terraform output rds_secret_arn
terraform output kms_key_arn
terraform output eks_kubeconfig_command
```

---

## Step 6: Configure EKS Cluster Access

### 6.1 Update kubeconfig

```bash
# Use the command from Terraform output
aws eks update-kubeconfig \
  --region ap-south-1 \
  --name $(terraform -chdir=infra/terraform output -raw eks_cluster_name)
```

### 6.2 Verify Cluster Access

```bash
kubectl cluster-info
kubectl get nodes
# Should show your managed node group nodes in Ready state
```

### 6.3 Create Namespaces

```bash
kubectl create namespace monitoring  # For Prometheus/Grafana (optional)
```

The `vaidyah` namespace is created by the K8s manifests in Step 11.

---

## Step 7: Install Cluster Add-Ons

### 7.1 AWS Load Balancer Controller

Required for ALB Ingress to work.

```bash
# Create IAM policy for the LB controller
curl -o iam-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.1/docs/install/iam_policy.json

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam-policy.json

# Create IRSA for the LB controller
EKS_CLUSTER=$(terraform -chdir=infra/terraform output -raw eks_cluster_name)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

eksctl create iamserviceaccount \
  --cluster=$EKS_CLUSTER \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=arn:aws:iam::${ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

# Install via Helm
helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --set clusterName=$EKS_CLUSTER \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=ap-south-1 \
  --set vpcId=$(terraform -chdir=infra/terraform output -raw vpc_id)
```

Verify:

```bash
kubectl get deployment -n kube-system aws-load-balancer-controller
# Should show 1/1 READY
```

### 7.2 Metrics Server (for HPA)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Verify
kubectl get deployment metrics-server -n kube-system
```

### 7.3 External Secrets Operator (recommended for production)

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets \
  --create-namespace \
  --set installCRDs=true
```

Configure the ClusterSecretStore to use AWS Secrets Manager:

```yaml
# Apply this after ESO is running:
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secrets-manager
spec:
  provider:
    aws:
      service: SecretsManager
      region: ap-south-1
      auth:
        jwt:
          serviceAccountRef:
            name: vaidyah-service-account
            namespace: vaidyah
```

### 7.4 Enable VPC CNI Network Policy Support

```bash
kubectl set env daemonset aws-node -n kube-system ENABLE_NETWORK_POLICY=true
```

---

## Step 8: Create ECR Repositories

Create one ECR repository per service:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="ap-south-1"

for svc in api-gateway clinical-service integration-service voice-service nlu-service trial-service admin-portal; do
  aws ecr create-repository \
    --repository-name "vaidyah/$svc" \
    --region $REGION \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=KMS \
    --tags Key=Project,Value=vaidyah Key=Service,Value=$svc
  echo "Created vaidyah/$svc"
done
```

Set lifecycle policy to keep only last 10 images:

```bash
POLICY='{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": { "type": "expire" }
    }
  ]
}'

for svc in api-gateway clinical-service integration-service voice-service nlu-service trial-service admin-portal; do
  aws ecr put-lifecycle-policy \
    --repository-name "vaidyah/$svc" \
    --lifecycle-policy-text "$POLICY" \
    --region $REGION
done
```

---

## Step 9: Build and Push Docker Images

### 9.1 Authenticate Docker to ECR

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="ap-south-1"
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ECR_REGISTRY
```

### 9.2 Build and Push Node.js Services

```bash
IMAGE_TAG="dev-$(git rev-parse --short HEAD)"

# API Gateway
docker build -t $ECR_REGISTRY/vaidyah/api-gateway:$IMAGE_TAG services/api-gateway/
docker push $ECR_REGISTRY/vaidyah/api-gateway:$IMAGE_TAG

# Clinical Service
docker build -t $ECR_REGISTRY/vaidyah/clinical-service:$IMAGE_TAG services/clinical-service/
docker push $ECR_REGISTRY/vaidyah/clinical-service:$IMAGE_TAG

# Integration Service
docker build -t $ECR_REGISTRY/vaidyah/integration-service:$IMAGE_TAG services/integration-service/
docker push $ECR_REGISTRY/vaidyah/integration-service:$IMAGE_TAG
```

### 9.3 Build and Push Python Services

```bash
# Voice Service
docker build -t $ECR_REGISTRY/vaidyah/voice-service:$IMAGE_TAG services/voice-service/
docker push $ECR_REGISTRY/vaidyah/voice-service:$IMAGE_TAG

# NLU Service
docker build -t $ECR_REGISTRY/vaidyah/nlu-service:$IMAGE_TAG services/nlu-service/
docker push $ECR_REGISTRY/vaidyah/nlu-service:$IMAGE_TAG

# Trial Service
docker build -t $ECR_REGISTRY/vaidyah/trial-service:$IMAGE_TAG services/trial-service/
docker push $ECR_REGISTRY/vaidyah/trial-service:$IMAGE_TAG
```

### 9.4 Build and Push Admin Portal

The admin portal needs a Dockerfile. Create one first if it doesn't exist:

```bash
cat > apps/admin-portal/Dockerfile << 'DOCKERFILE'
# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ---- Production Stage ----
FROM nginx:1.27-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
RUN printf 'server {\n  listen 8080;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / { try_files $uri $uri/ /index.html; }\n  location /health { return 200 "ok"; add_header Content-Type text/plain; }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
DOCKERFILE
```

Then build and push:

```bash
docker build -t $ECR_REGISTRY/vaidyah/admin-portal:$IMAGE_TAG apps/admin-portal/
docker push $ECR_REGISTRY/vaidyah/admin-portal:$IMAGE_TAG
```

### 9.5 Verify Images

```bash
for svc in api-gateway clinical-service integration-service voice-service nlu-service trial-service admin-portal; do
  echo "$svc:"
  aws ecr describe-images --repository-name "vaidyah/$svc" --region $REGION \
    --query 'imageDetails[*].imageTags' --output text | head -1
done
```

---

## Step 10: Create Secrets in AWS Secrets Manager

### 10.1 Get RDS Password

The RDS module automatically creates a Secrets Manager secret for the database password:

```bash
RDS_SECRET_ARN=$(terraform -chdir=infra/terraform output -raw rds_secret_arn)
RDS_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id $RDS_SECRET_ARN \
  --query SecretString --output text | jq -r '.password')

RDS_ENDPOINT=$(terraform -chdir=infra/terraform output -raw rds_endpoint)
```

### 10.2 Create Application Secrets

```bash
ENVIRONMENT="dev"  # Change to staging/prod as needed

# Generate a strong JWT secret
JWT_SECRET=$(openssl rand -base64 48)

# Get Cognito values from Terraform
COGNITO_POOL_ID=$(terraform -chdir=infra/terraform output -raw cognito_providers_user_pool_id)
COGNITO_CLIENT_ID=$(terraform -chdir=infra/terraform output -raw cognito_providers_client_id)
OPENSEARCH_ENDPOINT=$(terraform -chdir=infra/terraform output -raw opensearch_endpoint)

# Get Redis endpoint (not in root outputs -- query module directly or use AWS CLI)
REDIS_ENDPOINT=$(aws elasticache describe-replication-groups \
  --query "ReplicationGroups[?starts_with(ReplicationGroupId,'vaidyah-${ENVIRONMENT}')].NodeGroups[0].PrimaryEndpoint.Address" \
  --output text --region ap-south-1)
REDIS_PORT=$(aws elasticache describe-replication-groups \
  --query "ReplicationGroups[?starts_with(ReplicationGroupId,'vaidyah-${ENVIRONMENT}')].NodeGroups[0].PrimaryEndpoint.Port" \
  --output text --region ap-south-1)

# Create the application secret
aws secretsmanager create-secret \
  --name "vaidyah/${ENVIRONMENT}/app-secrets" \
  --region ap-south-1 \
  --secret-string "{
    \"DATABASE_URL\": \"postgresql://vaidyah_admin:${RDS_PASSWORD}@${RDS_ENDPOINT}/vaidyah\",
    \"REDIS_URL\": \"rediss://default:${REDIS_AUTH_TOKEN}@${REDIS_ENDPOINT}:${REDIS_PORT}\",
    \"JWT_SECRET\": \"${JWT_SECRET}\",
    \"COGNITO_USER_POOL_ID\": \"${COGNITO_POOL_ID}\",
    \"COGNITO_CLIENT_ID\": \"${COGNITO_CLIENT_ID}\",
    \"COGNITO_CLIENT_SECRET\": \"\",
    \"OPENSEARCH_USERNAME\": \"admin\",
    \"OPENSEARCH_PASSWORD\": \"admin\",
    \"ENCRYPTION_KEY\": \"$(openssl rand -base64 32)\",
    \"OPENAI_API_KEY\": \"\"
  }"
```

### 10.3 K8s Secret Provisioning

There are two approaches, depending on whether you have External Secrets Operator (ESO) installed:

**Option A: External Secrets Operator (recommended for staging/prod)**

The `infra/k8s/secrets.yml` contains an `ExternalSecret` CRD that automatically syncs secrets from AWS Secrets Manager into the cluster. This requires ESO installed (see Step 7.3). The deploy script applies this automatically.

**Option B: Manual K8s Secret (for dev or when ESO is not available)**

Use the template file `infra/k8s/secrets.yml.template` with base64-encoded values, or create the secret directly:

```bash
kubectl create namespace vaidyah 2>/dev/null || true

kubectl create secret generic vaidyah-secrets \
  --namespace vaidyah \
  --from-literal=DATABASE_URL="postgresql://vaidyah_admin:${RDS_PASSWORD}@${RDS_ENDPOINT}/vaidyah" \
  --from-literal=REDIS_URL="rediss://default:${REDIS_AUTH_TOKEN}@${REDIS_ENDPOINT}:${REDIS_PORT}" \
  --from-literal=JWT_SECRET="${JWT_SECRET}" \
  --from-literal=COGNITO_USER_POOL_ID="${COGNITO_POOL_ID}" \
  --from-literal=COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID}" \
  --from-literal=COGNITO_CLIENT_SECRET="" \
  --from-literal=OPENSEARCH_USERNAME="admin" \
  --from-literal=OPENSEARCH_PASSWORD="admin" \
  --from-literal=ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  --from-literal=OPENAI_API_KEY=""
```

If using Option B, skip `secrets.yml` in the deploy script (it will try to apply the ExternalSecret CRD which requires ESO). Either comment it out in `deploy.sh` or apply manifests manually (see Step 11.3).

---

## Step 11: Deploy Kubernetes Manifests

### 11.1 Set Deployment Variables

```bash
export ENVIRONMENT="dev"
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION="ap-south-1"
export IMAGE_TAG="dev-$(git rev-parse --short HEAD)"
export ACM_CERTIFICATE_ARN="arn:aws:acm:ap-south-1:${AWS_ACCOUNT_ID}:certificate/YOUR_CERT_ID"
export WAF_WEB_ACL_ARN=""  # Optional for dev, required for prod
export ALB_SECURITY_GROUP_ID=""  # Optional
export OPENSEARCH_ENDPOINT=$(terraform -chdir=infra/terraform output -raw opensearch_endpoint)
export DYNAMODB_TABLE_PREFIX="vaidyah-${ENVIRONMENT}"
```

### 11.2 Deploy Using the Deploy Script

The `deploy.sh` script handles envsubst and applies manifests in the correct order:

```bash
cd infra/k8s
chmod +x deploy.sh
./deploy.sh
```

This applies manifests in this order:
1. `namespace.yml` - Namespace with ResourceQuota (8 CPU requests / 16 CPU limits, 16Gi / 32Gi memory) and LimitRange
2. `secrets.yml` - ExternalSecret CRD (requires ESO; use `secrets.yml.template` for manual secrets or skip if created in Step 10.3)
3. `configmap.yml` - Service URLs, AWS config, feature flags
4. `service-account.yml` - IRSA-annotated ServiceAccount
5. `network-policy.yml` - Zero-trust network segmentation
6. `api-gateway.yml` - Deployment + Service + HPA (2-10) + PDB
7. `clinical-service.yml` - Deployment + Service + HPA (2-6) + PDB
8. `voice-service.yml` - Deployment + Service + HPA (2-8) + PDB
9. `nlu-service.yml` - Deployment + Service + HPA (2-6) + PDB
10. `trial-service.yml` - Deployment + Service + HPA (2-4) + PDB
11. `integration-service.yml` - Deployment + Service + HPA (2-4) + PDB
12. `admin-portal.yml` - Deployment + Service + HPA (2-6) + PDB
13. `ingress.yml` - ALB with TLS, WAF, HTTP->HTTPS redirect

### 11.3 Or Deploy Manually (Step by Step)

If you prefer to apply each manifest individually:

```bash
cd infra/k8s

# Substitution variables (only substitute explicitly listed vars)
SUBST_VARS='${ENVIRONMENT} ${AWS_ACCOUNT_ID} ${AWS_REGION} ${IMAGE_TAG} ${ACM_CERTIFICATE_ARN} ${WAF_WEB_ACL_ARN} ${ALB_SECURITY_GROUP_ID} ${OPENSEARCH_ENDPOINT} ${DYNAMODB_TABLE_PREFIX}'

# 1. Namespace
envsubst "$SUBST_VARS" < namespace.yml | kubectl apply -f -

# 2. Secrets
# Option A: ExternalSecret CRD (requires ESO from Step 7.3)
envsubst "$SUBST_VARS" < secrets.yml | kubectl apply -f -
# Option B: Manual secret (skip if already created in Step 10.3 Option B)
# kubectl apply -f secrets.yml.template  # After replacing base64 placeholders

# 3. ConfigMap
envsubst "$SUBST_VARS" < configmap.yml | kubectl apply -f -

# 4. Service Account (IRSA)
envsubst "$SUBST_VARS" < service-account.yml | kubectl apply -f -

# 5. Network Policies
envsubst "$SUBST_VARS" < network-policy.yml | kubectl apply -f -

# 6. Services (can be parallel)
for manifest in api-gateway.yml clinical-service.yml integration-service.yml voice-service.yml nlu-service.yml trial-service.yml admin-portal.yml; do
  envsubst "$SUBST_VARS" < "$manifest" | kubectl apply -f -
done

# 7. Ingress (last)
envsubst "$SUBST_VARS" < ingress.yml | kubectl apply -f -
```

### 11.4 Wait for Rollouts

```bash
for svc in api-gateway clinical-service integration-service voice-service nlu-service trial-service admin-portal; do
  echo "Waiting for $svc..."
  kubectl rollout status deployment/$svc -n vaidyah --timeout=300s
done
```

---

## Step 12: Configure DNS and TLS

### 12.1 Request ACM Certificate

If you don't already have one:

```bash
aws acm request-certificate \
  --domain-name "api.vaidyah.health" \
  --subject-alternative-names "*.vaidyah.health" \
  --validation-method DNS \
  --region ap-south-1
```

Complete DNS validation by adding the CNAME records shown in the ACM console.

### 12.2 Get ALB DNS Name

After the Ingress is created, the ALB is provisioned automatically:

```bash
ALB_DNS=$(kubectl get ingress vaidyah-ingress -n vaidyah \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "ALB endpoint: $ALB_DNS"
```

This may take 2-5 minutes to provision.

### 12.3 Create Route53 DNS Record

```bash
# Get your hosted zone ID
ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name "vaidyah.health" \
  --query 'HostedZones[0].Id' --output text | sed 's|/hostedzone/||')

# Get the ALB hosted zone ID
ALB_ZONE_ID=$(aws elbv2 describe-load-balancers \
  --query "LoadBalancers[?DNSName=='${ALB_DNS}'].CanonicalHostedZoneId" \
  --output text)

# Create alias record
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"api.vaidyah.health\",
        \"Type\": \"A\",
        \"AliasTarget\": {
          \"HostedZoneId\": \"$ALB_ZONE_ID\",
          \"DNSName\": \"$ALB_DNS\",
          \"EvaluateTargetHealth\": true
        }
      }
    }]
  }"
```

### 12.4 Verify TLS

```bash
# Wait for DNS propagation (may take a few minutes)
curl -v https://api.vaidyah.health/health
```

---

## Step 13: Database Initialization

### 13.1 Initial Schema

The database schema is initialized via `scripts/init.sql`. For the production RDS instance, connect from a pod that has network access to RDS:

```bash
# Get the RDS endpoint
RDS_ENDPOINT=$(terraform -chdir=infra/terraform output -raw rds_endpoint)
RDS_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id $(terraform -chdir=infra/terraform output -raw rds_secret_arn) \
  --query SecretString --output text | jq -r '.password')

# Exec into a running pod (api-gateway has psql-compatible connectivity)
kubectl exec -it deployment/api-gateway -n vaidyah -- sh

# Inside the pod, verify DB connection
wget -qO- "http://localhost:3000/health"
# The health endpoint confirms database connectivity

exit
```

### 13.2 Run Schema from Local Machine

To apply `scripts/init.sql` against the production database, use a temporary pod:

```bash
# Launch a temporary postgres client pod
kubectl run pg-client --rm -it --restart=Never -n vaidyah \
  --image=postgres:16-alpine \
  --env="PGPASSWORD=${RDS_PASSWORD}" \
  -- psql -h "${RDS_ENDPOINT%%:*}" -U vaidyah_admin -d vaidyah

# Inside psql, paste the contents of scripts/init.sql, then \q to exit
```

Or if you have direct network access (VPN/bastion):

```bash
PGPASSWORD="${RDS_PASSWORD}" psql \
  -h "${RDS_ENDPOINT%%:*}" -U vaidyah_admin -d vaidyah \
  -f scripts/init.sql
```

### 13.3 Create OpenSearch Index

The trial-service auto-creates its index on startup, but you can verify:

```bash
kubectl exec -it deployment/trial-service -n vaidyah -- \
  python -c "
import httpx
import os
endpoint = os.environ.get('OPENSEARCH_ENDPOINT', 'https://localhost:9200')
r = httpx.get(f'{endpoint}/_cat/indices', verify=False)
print(r.text)
"
```

---

## Step 14: Verify Deployment

### 14.1 Check Pod Status

```bash
kubectl get pods -n vaidyah -o wide
# All pods should show Running and Ready (1/1)
```

Expected output:

```
NAME                                    READY   STATUS    RESTARTS
api-gateway-xxxxx-yyyyy                 1/1     Running   0
api-gateway-xxxxx-zzzzz                 1/1     Running   0
clinical-service-xxxxx-yyyyy            1/1     Running   0
clinical-service-xxxxx-zzzzz            1/1     Running   0
integration-service-xxxxx-yyyyy         1/1     Running   0
voice-service-xxxxx-yyyyy               1/1     Running   0
nlu-service-xxxxx-yyyyy                 1/1     Running   0
trial-service-xxxxx-yyyyy               1/1     Running   0
admin-portal-xxxxx-yyyyy                1/1     Running   0
```

### 14.2 Run Health Checks (In-Cluster)

```bash
kubectl exec deployment/api-gateway -n vaidyah -- \
  wget -qO- http://api-gateway.vaidyah.svc.cluster.local:3000/health

kubectl exec deployment/api-gateway -n vaidyah -- \
  wget -qO- http://clinical-service.vaidyah.svc.cluster.local:3001/health

kubectl exec deployment/api-gateway -n vaidyah -- \
  wget -qO- http://voice-service.vaidyah.svc.cluster.local:8001/health

kubectl exec deployment/api-gateway -n vaidyah -- \
  wget -qO- http://nlu-service.vaidyah.svc.cluster.local:8002/health

kubectl exec deployment/api-gateway -n vaidyah -- \
  wget -qO- http://trial-service.vaidyah.svc.cluster.local:8003/health

kubectl exec deployment/api-gateway -n vaidyah -- \
  wget -qO- http://integration-service.vaidyah.svc.cluster.local:3002/health
```

### 14.3 Run Health Checks (External)

```bash
curl https://api.vaidyah.health/health
# Expected: {"status":"healthy","uptime":...,"services":{"database":"connected","redis":"connected"}}
```

### 14.4 Check HPA and Resources

```bash
kubectl get hpa -n vaidyah
kubectl top pods -n vaidyah
kubectl describe resourcequota vaidyah-resource-quota -n vaidyah
```

### 14.5 Check Ingress

```bash
kubectl get ingress -n vaidyah
# Should show the ALB hostname and 443 port
```

### 14.6 Smoke Test Key Flows

```bash
# Test API through the ALB
curl -s https://api.vaidyah.health/health | jq .

# Test trial search (public endpoint)
curl -s "https://api.vaidyah.health/api/v1/trials?query=diabetes&page=1&page_size=5" | jq .
```

---

## Step 15: Set Up CI/CD

### 15.1 Configure GitHub Repository Secrets

Go to your GitHub repo > Settings > Secrets and variables > Actions, and add:

| Secret | Value |
|--------|-------|
| `AWS_ACCOUNT_ID` | Your AWS account ID (12 digits) |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/vaidyah-deploy-role` |
| `AWS_TERRAFORM_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/vaidyah-terraform-role` |
| `SLACK_WEBHOOK_URL` | Your Slack incoming webhook URL |

And variables:

| Variable | Value |
|----------|-------|
| `TURBO_TEAM` | Your Turborepo team (optional) |

And secrets (optional):

| Secret | Value |
|--------|-------|
| `TURBO_TOKEN` | Turborepo remote cache token (optional) |

### 15.2 Configure GitHub Environments

Create these environments in GitHub repo > Settings > Environments:

1. **dev** - No protection rules
2. **staging** - Optional: require reviewer
3. **production** - Required: 1+ reviewer, restrict to `main` branch
4. **terraform-dev** - No protection
5. **terraform-staging** - Optional: require reviewer
6. **terraform-prod** - Required: 1+ reviewer

### 15.3 How the Pipelines Work

**CI (on every PR/push):**
- Lints and type-checks all TypeScript code
- Runs Jest tests for Node.js services (with PostgreSQL + Redis containers)
- Runs pytest for Python services
- Builds all packages to verify compilation
- Runs security scans (npm audit, pip-audit)

**CD (on merge to main/develop):**
- Detects which services changed using path filters
- Builds Docker images only for changed services
- Pushes to ECR with tags `{env}-{sha}` and `{env}-latest`
- Deploys to EKS via `kubectl set image`
- Runs smoke tests against deployed services
- Sends Slack notification

**Terraform (on infra changes):**
- Plans on PRs (posts output to PR comment)
- Applies on merge to main (sequential, per environment)

### 15.4 Trigger First Deployment

```bash
git add .
git commit -m "chore: initial deployment configuration"
git push origin main
```

Monitor the GitHub Actions tab for pipeline progress.

---

## Step 16: Post-Deployment Tasks

### 16.1 Create Initial Admin User in Cognito

```bash
PROVIDERS_POOL_ID=$(terraform -chdir=infra/terraform output -raw cognito_providers_user_pool_id)

aws cognito-idp admin-create-user \
  --user-pool-id $PROVIDERS_POOL_ID \
  --username "admin@vaidyah.health" \
  --user-attributes \
    Name=email,Value=admin@vaidyah.health \
    Name=email_verified,Value=true \
    Name=custom:role,Value=admin \
  --temporary-password "TempPass123!" \
  --region ap-south-1
```

### 16.2 Trigger Initial Trial Data Sync

```bash
# Get a valid JWT token first, then:
curl -X POST https://api.vaidyah.health/api/v1/ingest/sync \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json"
```

### 16.3 Set Up Monitoring (Optional)

Install Prometheus + Grafana for metrics:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword="your-grafana-password"
```

All Vaidyah pods have Prometheus scrape annotations configured:

```yaml
prometheus.io/scrape: "true"
prometheus.io/port: "<service-port>"
prometheus.io/path: "/metrics"
```

### 16.4 Set Up CloudWatch Alarms

```bash
# Example: RDS CPU > 80%
aws cloudwatch put-metric-alarm \
  --alarm-name "vaidyah-rds-high-cpu" \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3 \
  --alarm-actions "arn:aws:sns:ap-south-1:ACCOUNT_ID:vaidyah-alerts" \
  --dimensions Name=DBInstanceIdentifier,Value=vaidyah-dev-db \
  --region ap-south-1
```

### 16.5 Configure WAF Rules (Production)

For production deployments, create a WAF WebACL:

```bash
WAF_ACL_ARN=$(aws wafv2 create-web-acl \
  --name "vaidyah-prod-waf" \
  --scope REGIONAL \
  --default-action '{"Allow":{}}' \
  --rules '[
    {
      "Name": "AWSManagedRulesCommonRuleSet",
      "Priority": 1,
      "Statement": {"ManagedRuleGroupStatement": {"VendorName": "AWS", "Name": "AWSManagedRulesCommonRuleSet"}},
      "OverrideAction": {"None": {}},
      "VisibilityConfig": {"SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "CommonRuleSet"}
    },
    {
      "Name": "RateLimit",
      "Priority": 2,
      "Statement": {"RateBasedStatement": {"Limit": 2000, "AggregateKeyType": "IP"}},
      "Action": {"Block": {}},
      "VisibilityConfig": {"SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "RateLimit"}
    }
  ]' \
  --visibility-config '{"SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "vaidyah-waf"}' \
  --region ap-south-1 \
  --query 'Summary.ARN' --output text)

echo "WAF ACL ARN: $WAF_ACL_ARN"
# Use this ARN in the WAF_WEB_ACL_ARN environment variable for deploy.sh
```

---

## Step 17: Rollback Procedures

### 17.1 Rollback a Service Deployment

```bash
# View deployment history
kubectl rollout history deployment/api-gateway -n vaidyah

# Rollback to previous version
kubectl rollout undo deployment/api-gateway -n vaidyah

# Rollback to specific revision
kubectl rollout undo deployment/api-gateway -n vaidyah --to-revision=3

# Wait for rollback to complete
kubectl rollout status deployment/api-gateway -n vaidyah
```

### 17.2 Rollback All Services

```bash
for svc in api-gateway clinical-service integration-service voice-service nlu-service trial-service admin-portal; do
  echo "Rolling back $svc..."
  kubectl rollout undo deployment/$svc -n vaidyah
done
```

### 17.3 Rollback Infrastructure (Terraform)

```bash
cd infra/terraform

# View the previous state
terraform show

# Re-apply a specific plan or revert to a previous state version
# (S3 bucket versioning enables state file recovery)
aws s3api list-object-versions \
  --bucket vaidyah-terraform-state \
  --prefix "infrastructure/dev/terraform.tfstate" \
  --query 'Versions[0:5].{VersionId:VersionId,LastModified:LastModified}'
```

### 17.4 Emergency: Scale Down

```bash
# Scale a problematic service to zero
kubectl scale deployment/voice-service -n vaidyah --replicas=0

# Scale back up
kubectl scale deployment/voice-service -n vaidyah --replicas=2
```

---

## Quick Reference

### Service Ports

| Service | Container Port | K8s Service Port | Health Check |
|---------|---------------|-----------------|--------------|
| api-gateway | 3000 | 3000 | GET /health |
| clinical-service | 3001 | 3001 | GET /health |
| integration-service | 3002 | 3002 | GET /health |
| voice-service | 8001 | 8001 | GET /health |
| nlu-service | 8002 | 8002 | GET /health |
| trial-service | 8003 | 8003 | GET /health |
| admin-portal | 8080 | 80 | GET / |

### Useful Commands

```bash
# View all resources in namespace
kubectl get all -n vaidyah

# Describe a failing pod
kubectl describe pod <pod-name> -n vaidyah

# Stream logs
kubectl logs -f deployment/api-gateway -n vaidyah

# Debug shell in a pod
kubectl exec -it deployment/api-gateway -n vaidyah -- sh

# Resource usage
kubectl top pods -n vaidyah

# Force restart a deployment
kubectl rollout restart deployment/api-gateway -n vaidyah

# View Terraform state
terraform -chdir=infra/terraform output

# Re-authenticate to ECR (token expires every 12 hours)
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin $ECR_REGISTRY
```

### Environment Deployment Matrix

| Action | Dev | Staging | Prod |
|--------|-----|---------|------|
| Terraform apply | Auto on merge | Auto on merge | Manual approval |
| Docker build/push | Auto on PR merge | Auto on develop push | Auto on main push |
| K8s deploy | Auto | Auto | Requires reviewer |
| WAF | Optional | Optional | Required |
| Multi-AZ RDS | No | Yes | Yes |
| Backup retention | 3 days | 7 days | 30 days |
| EKS nodes | 2-4 (t3.medium) | 2-6 (t3.large) | 3-12 (m6i.xlarge) |
| VPC CIDR | 10.10.0.0/16 | 10.20.0.0/16 | 10.30.0.0/16 |
