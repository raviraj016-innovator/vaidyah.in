# Vaidyah Healthcare Platform — Complete Deployment Guide

**Target budget:** < $100/month for a small user group (~$38-52/month typical).

This guide walks you through deploying the entire Vaidyah platform from scratch on AWS + Vercel.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Monthly Cost Breakdown](#2-monthly-cost-breakdown)
3. [Prerequisites](#3-prerequisites)
4. [Phase 1: AWS Account Setup](#4-phase-1-aws-account-setup)
5. [Phase 2: Terraform Infrastructure](#5-phase-2-terraform-infrastructure)
6. [Phase 3: EC2 Server Setup](#6-phase-3-ec2-server-setup)
7. [Phase 4: Database Initialization](#7-phase-4-database-initialization)
8. [Phase 5: Docker Compose Production Deployment](#8-phase-5-docker-compose-production-deployment)
9. [Phase 6: Vercel Web App Deployment](#9-phase-6-vercel-web-app-deployment)
10. [Phase 7: CI/CD Pipeline Setup](#10-phase-7-cicd-pipeline-setup)
11. [Phase 8: Post-Deployment Verification](#11-phase-8-post-deployment-verification)
12. [Service Reference](#12-service-reference)
13. [Environment Variables Reference](#13-environment-variables-reference)
14. [Database Schema Reference](#14-database-schema-reference)
15. [Monitoring & Logging](#15-monitoring--logging)
16. [Troubleshooting](#16-troubleshooting)
17. [Maintenance & Operations](#17-maintenance--operations)
18. [Scaling Up](#18-scaling-up)
19. [Local Development Setup](#19-local-development-setup)

---

## 1. Architecture Overview

```
┌──────────────────┐     ┌────────────────────────────────────────┐
│  Vercel (Free)   │────▸│  EC2 t3.small ($15/mo)                 │
│  Next.js Web App │     │  ┌─────────────────────────────────┐   │
│                  │     │  │ Docker Compose                  │   │
│  /api/v1/* ──────┼─────┼──▸ api-gateway (:3000)             │   │
│  /auth/*   ──────┼─────┘  │ voice-service (:8001)            │   │
└──────────────────┘        │ nlu-service (:8002)              │   │
                            │ clinical-service (:3001)         │   │
                            │ trial-service (:8003)            │   │
                            │ integration-service (:3002)      │   │
                            │ telemedicine-service (:8004)     │   │
                            │ redis (:6379)                    │   │
                            │ livekit (:7880)                  │   │
                            └─────────────────────────────────┘   │
                            └──────────┬─────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────┐
        ▼                              ▼                          ▼
┌─────────────────┐   ┌──────────────────────┐   ┌──────────────────┐
│ RDS db.t3.micro │   │  AWS Bedrock          │   │  S3               │
│ PostgreSQL 16   │   │  Claude 3 Haiku       │   │  Voice recordings │
│ ($10/mo)        │   │  (~$5-15/mo)          │   │  Documents        │
└─────────────────┘   └──────────────────────┘   └──────────────────┘
                      ┌──────────────────────┐
                      │  Transcribe + Polly   │
                      │  (~$3-5/mo)           │
                      └──────────────────────┘
```

### What's Running Where

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 15 on Vercel (free) | Web app for admin, nurse, patient portals |
| **API Gateway** | Express.js (Node 20) | Authentication, routing, rate limiting |
| **Voice** | FastAPI (Python 3.11) | AWS Transcribe (STT) + Polly (TTS) + prosody analysis |
| **NLU** | FastAPI (Python 3.11) | Bedrock Claude Haiku — symptom extraction, translation |
| **Clinical** | Express.js (Node 20) | Triage engine, SOAP note generation |
| **Trials** | FastAPI (Python 3.11) | Clinical trial search (PostgreSQL full-text) |
| **Integration** | Express.js (Node 20) | ABDM, WhatsApp, wearable device APIs |
| **Telemedicine** | Express.js (Node 20) | LiveKit video calls, real-time transcription |
| **Database** | PostgreSQL 16 (RDS) | All application data, full-text search |
| **Cache** | Redis 7 (Docker) | Session cache, rate limiting |
| **Media Server** | LiveKit (Docker) | WebRTC video/audio for telemedicine |

### What Changed from Full Production

| Removed | Replaced With |
|---------|---------------|
| EKS (Kubernetes) | Single EC2 + Docker Compose |
| SageMaker (3 ML endpoints) | Bedrock Claude 3 Haiku prompts |
| OpenSearch (2 nodes) | PostgreSQL full-text search (tsvector) |
| DynamoDB | PostgreSQL (same RDS instance) |
| ElastiCache Redis | Redis container on EC2 |
| Cognito | JWT (HS256) auth |
| Lambda + EventBridge | In-process schedulers |
| WAF, CloudTrail, X-Ray | Basic CloudWatch monitoring |
| AppSync GraphQL | REST API only |
| QuickSight | Web dashboard (built-in) |

---

## 2. Monthly Cost Breakdown

| Component | AWS Service | Cost |
|-----------|-------------|------|
| Compute | EC2 t3.small (2 vCPU, 2 GB RAM) | ~$15 |
| Database | RDS db.t3.micro (single-AZ, 20 GB, PostgreSQL 16) | ~$10 |
| ML / NLU | Bedrock Claude 3 Haiku (pay-per-token) | ~$5-15 |
| Speech | Transcribe + Polly (on-demand) | ~$3-5 |
| Storage | S3 (voice recordings, documents, images) | ~$1-2 |
| DNS/SSL | Route 53 + ACM | ~$0.50 |
| Secrets | Secrets Manager (2 secrets) | ~$0.80 |
| Monitoring | CloudWatch (basic metrics + alarms) | ~$0-1 |
| Notifications | SNS (emergency + system alerts) | ~$0.50 |
| Encryption | KMS (1 CMK) | ~$1 |
| Container Registry | ECR (7 repos, 5 images each) | ~$1-2 |
| Web App | Vercel (free tier — 100 GB bandwidth) | $0 |
| **Total** | | **~$38-52/mo** |

---

## 3. Prerequisites

### 3.1 Accounts Required

1. **AWS Account** — with billing enabled and a payment method
2. **GitHub Account** — repository access for CI/CD
3. **Vercel Account** — free tier (sign up at https://vercel.com)

### 3.2 Local Tools (Install on Your Machine)

| Tool | Version | Install |
|------|---------|---------|
| **Terraform** | >= 1.5 | https://developer.hashicorp.com/terraform/install |
| **AWS CLI v2** | >= 2.15 | https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html |
| **Node.js** | >= 20 | https://nodejs.org |
| **npm** | >= 10 | Comes with Node.js |
| **Git** | >= 2.40 | https://git-scm.com |
| **psql** (optional) | >= 16 | For direct DB access — comes with PostgreSQL or can be installed standalone |

### 3.3 Verify Installations

```bash
terraform --version    # Terraform v1.5+
aws --version          # aws-cli/2.x
node --version         # v20.x
npm --version          # 10.x
git --version          # 2.40+
```

---

## 4. Phase 1: AWS Account Setup

### 4.1 Configure AWS CLI

```bash
aws configure
# AWS Access Key ID:     <your-access-key>
# AWS Secret Access Key: <your-secret-key>
# Default region name:   ap-south-1
# Default output format: json
```

> **Tip:** If you don't have access keys yet, go to **IAM > Users > your-user > Security credentials > Create access key**.

Verify it works:

```bash
aws sts get-caller-identity
# Should print your Account ID, ARN, and UserId
```

### 4.2 Enable Bedrock Model Access

This step is **critical** — without it, the NLU service will fail.

1. Open the **AWS Console** and navigate to **Amazon Bedrock**
2. In the left sidebar, click **Model access**
3. Click **Manage model access**
4. Check the box next to **Anthropic > Claude 3 Haiku**
5. Click **Request model access**
6. Wait for the status to change to **Access granted** (usually instant for Haiku)

Verify from CLI:

```bash
aws bedrock list-foundation-models --region ap-south-1 \
  --query "modelSummaries[?modelId=='anthropic.claude-3-haiku-20240307-v1:0'].modelId" \
  --output text
# Should print: anthropic.claude-3-haiku-20240307-v1:0
```

### 4.3 Create an EC2 Key Pair

This allows you to SSH into the EC2 instance.

```bash
aws ec2 create-key-pair \
  --key-name vaidyah-key \
  --key-type ed25519 \
  --query "KeyMaterial" \
  --output text > vaidyah-key.pem

chmod 400 vaidyah-key.pem
```

> **Important:** Store `vaidyah-key.pem` somewhere safe. If you lose it, you won't be able to SSH into the EC2 instance.

### 4.4 Find Your Public IP (for SSH Security)

```bash
curl -s https://checkip.amazonaws.com
# Example output: 203.0.113.42
```

You'll use this as `YOUR_IP/32` in the Terraform config (e.g., `203.0.113.42/32`).

---

## 5. Phase 2: Terraform Infrastructure

Terraform provisions: VPC, EC2, RDS, S3, KMS, Secrets Manager, SNS, CloudWatch, and ECR.

### 5.1 Initialize Terraform

```bash
cd infra/terraform

# Create your configuration file
cat > terraform.tfvars <<'TFVARS'
environment        = "prod"
ec2_instance_type  = "t3.small"
ec2_key_pair_name  = "vaidyah-key"
ssh_allowed_cidrs  = ["YOUR_IP/32"]
rds_instance_class = "db.t3.micro"
cors_allowed_origins = [
  "https://your-app.vercel.app",
  "http://localhost:3000"
]
TFVARS
```

**Edit `terraform.tfvars`** and replace:
- `YOUR_IP/32` with your actual public IP from step 4.4 (e.g., `203.0.113.42/32`)
- `your-app.vercel.app` with your planned Vercel domain (you can update this later)

### 5.2 Plan and Apply

```bash
terraform init
terraform plan -out=plan.tfplan
```

Review the plan output carefully. It will create approximately 40-50 resources. Then apply:

```bash
terraform apply plan.tfplan
```

This typically takes 10-15 minutes (RDS creation is the slowest).

### 5.3 Save Terraform Outputs

```bash
# Print all outputs
terraform output

# Save to file for reference
terraform output -json > ../../terraform-outputs.json
```

**Key outputs you'll need:**

| Output | Example | Used For |
|--------|---------|----------|
| `ec2_public_ip` | `13.233.x.x` | SSH, API Gateway URL |
| `rds_endpoint` | `vaidyah-prod-db.xxxxx.ap-south-1.rds.amazonaws.com:5432` | Database connection |
| `rds_secret_arn` | `arn:aws:secretsmanager:...` | Retrieving DB password |
| `ecr_repository_urls` | `{api-gateway: "123456.dkr.ecr..."}` | Docker image registry |
| `s3_voice_recordings_bucket` | `vaidyah-prod-voice-recordings` | Voice service config |
| `kms_phi_key_arn` | `arn:aws:kms:...` | Encryption key |
| `sns_emergency_alerts_topic_arn` | `arn:aws:sns:...` | Alert notifications |

### 5.4 Retrieve the Database Password

Terraform auto-generated a secure password and stored it in AWS Secrets Manager:

```bash
# Get the secret ARN
SECRET_ARN=$(terraform output -raw rds_secret_arn)

# Retrieve the password
aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" \
  --query "SecretString" \
  --output text | jq -r '.password'
```

Write down this password — you'll need it for the `.env` file.

---

## 6. Phase 3: EC2 Server Setup

### 6.1 SSH Into the Instance

```bash
EC2_IP=$(cd infra/terraform && terraform output -raw ec2_public_ip)

ssh -i vaidyah-key.pem ec2-user@$EC2_IP
```

> **Note:** The first SSH attempt may fail if the instance is still initializing (running user_data). Wait 2-3 minutes and retry.

### 6.2 Verify Docker Is Installed

The EC2 user_data script auto-installs Docker. Verify:

```bash
docker --version          # Docker version 24.x+
docker compose version    # Docker Compose version v2.x+
```

If Docker Compose isn't available as a plugin, use the standalone binary:

```bash
docker-compose --version  # Docker Compose version v2.x+
```

### 6.3 Create the Application Directory

```bash
sudo mkdir -p /opt/vaidyah
sudo chown ec2-user:ec2-user /opt/vaidyah
cd /opt/vaidyah
```

### 6.4 Create the Production `.env` File

Replace all placeholder values with your actual values from Terraform outputs:

```bash
cat > /opt/vaidyah/.env <<'DOTENV'
# ============ PostgreSQL (RDS) ============
POSTGRES_PASSWORD=<paste-password-from-step-5.4>
DB_HOST=<rds-endpoint-without-port>
DB_PORT=5432
DB_NAME=vaidyah
DB_USER=vaidyah_admin
DB_SSL=true
DB_SSL_MODE=require
DATABASE_URL=postgresql://vaidyah_admin:<password>@<rds-endpoint>:5432/vaidyah?sslmode=require

# ============ JWT Authentication ============
JWT_SECRET=<generate-below>

# ============ AWS ============
AWS_REGION=ap-south-1
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
BEDROCK_ML_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
S3_AUDIO_BUCKET=<s3-voice-recordings-bucket-name>

# ============ LiveKit (Telemedicine) ============
LIVEKIT_API_KEY=<generate-below>
LIVEKIT_API_SECRET=<generate-below>
LIVEKIT_WS_URL=ws://<ec2-public-ip>:7880

# ============ CORS ============
CORS_ORIGINS=https://your-app.vercel.app,http://localhost:3001

# ============ Node Environment ============
NODE_ENV=production
DOTENV
```

**Generate secure values:**

```bash
# Generate JWT_SECRET (64 hex chars)
openssl rand -hex 32

# Generate LIVEKIT_API_KEY (short identifier)
echo "vaidyah_$(openssl rand -hex 4)"

# Generate LIVEKIT_API_SECRET (64 hex chars)
openssl rand -hex 32
```

**Replace placeholders** in the `.env` file:

```bash
# Example: replace <rds-endpoint-without-port>
# If terraform output rds_endpoint = "vaidyah-prod-db.abc123.ap-south-1.rds.amazonaws.com:5432"
# Then DB_HOST = "vaidyah-prod-db.abc123.ap-south-1.rds.amazonaws.com"
# And DATABASE_URL = "postgresql://vaidyah_admin:YOUR_PASSWORD@vaidyah-prod-db.abc123.ap-south-1.rds.amazonaws.com:5432/vaidyah?sslmode=require"

nano /opt/vaidyah/.env   # or vi
```

### 6.5 Secure the `.env` File

```bash
chmod 600 /opt/vaidyah/.env
```

---

## 7. Phase 4: Database Initialization

### 7.1 Install PostgreSQL Client on EC2

```bash
sudo dnf install -y postgresql16
```

### 7.2 Test RDS Connectivity

```bash
# Source the env file to get DB vars
source /opt/vaidyah/.env

# Test connection
PGPASSWORD=$POSTGRES_PASSWORD psql \
  -h $DB_HOST \
  -p $DB_PORT \
  -U $DB_USER \
  -d $DB_NAME \
  -c "SELECT version();"
```

You should see PostgreSQL 16.x output.

### 7.3 Copy Schema Files to EC2

From your **local machine** (not the EC2 instance):

```bash
EC2_IP=$(cd infra/terraform && terraform output -raw ec2_public_ip)

scp -i vaidyah-key.pem scripts/init.sql ec2-user@$EC2_IP:/opt/vaidyah/
scp -i vaidyah-key.pem scripts/rls-policies.sql ec2-user@$EC2_IP:/opt/vaidyah/
```

### 7.4 Run the Schema Initialization

Back on the **EC2 instance**:

```bash
cd /opt/vaidyah
source .env

# Step 1: Create all tables, indexes, triggers, and seed data
PGPASSWORD=$POSTGRES_PASSWORD psql \
  -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -f init.sql

# Step 2: Apply Row-Level Security policies
PGPASSWORD=$POSTGRES_PASSWORD psql \
  -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -f rls-policies.sql
```

### 7.5 Verify Database

```bash
PGPASSWORD=$POSTGRES_PASSWORD psql \
  -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -c "\dt"
```

You should see approximately 20+ tables:

| Key Tables | Purpose |
|-----------|---------|
| `health_centers` | 8 seeded Bihar health facilities |
| `users` | 10 seeded users (admins, doctors, nurses) |
| `patients` | 8 seeded patients |
| `consultations` | 8 sample consultations with vitals/SOAP |
| `consultation_sessions` | API gateway session management |
| `session_vitals` | Vitals recorded per session |
| `clinical_trials` | Clinical trial data (full-text searchable) |
| `triage_results` | AI-assisted triage assessments |
| `soap_notes` | AI-generated SOAP notes |
| `alerts` | Emergency + system alerts |
| `audit_log` | HIPAA-compliant audit trail |
| `whatsapp_messages` | WhatsApp integration logs |
| `wearable_connections` | Wearable device OAuth tokens |
| `wearable_data` | Synced health data from wearables |
| `emergency_alerts` | Emergency alert tracking |
| `health_alerts` | Patient health alerts |
| `scheduled_notifications` | Notification queue |

### 7.6 Verify RLS Policies

```bash
PGPASSWORD=$POSTGRES_PASSWORD psql \
  -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
  -c "SELECT tablename, policyname FROM pg_policies ORDER BY tablename;"
```

This should show RLS policies on `patients`, `consultations`, `clinical_trials`, `audit_log`, and other PHI tables. The RLS policies enforce role-based access:

| Database Role | Access Level |
|--------------|-------------|
| `vaidyah_super_admin` | Full access to all data |
| `vaidyah_doctor` | Patients at their center |
| `vaidyah_nurse` | Patients at their center |
| `vaidyah_patient` | Own data only |
| `vaidyah_researcher` | De-identified trial data only |

---

## 8. Phase 5: Docker Compose Production Deployment

### 8.1 Clone the Repository on EC2

```bash
cd /opt/vaidyah
git clone https://github.com/YOUR_ORG/vaidyah.git repo
```

Or copy the docker-compose.yml and Dockerfiles:

```bash
# From your local machine
scp -i vaidyah-key.pem -r \
  docker-compose.yml \
  services/ \
  packages/ \
  scripts/ \
  clinical-trials.csv \
  ec2-user@$EC2_IP:/opt/vaidyah/
```

### 8.2 Create Production Docker Compose Override

The default `docker-compose.yml` includes a local `postgres` service. For production, you need to override it to use RDS instead. Create a `docker-compose.prod.yml`:

```bash
cat > /opt/vaidyah/docker-compose.prod.yml <<'COMPOSE'
services:
  # Disable local postgres (using RDS)
  postgres:
    profiles: ["disabled"]

  # Override api-gateway to point to RDS
  api-gateway:
    environment:
      - NODE_ENV=production
      - DB_HOST=${DB_HOST}
      - DB_PORT=${DB_PORT}
      - DB_NAME=${DB_NAME}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${POSTGRES_PASSWORD}
      - DB_SSL=true
    volumes: []  # Don't mount source in production
    depends_on:
      redis:
        condition: service_started

  # Override clinical-service to point to RDS
  clinical-service:
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - NLU_SERVICE_URL=http://nlu-service:8002
    volumes: []
    depends_on: []

  # Override trial-service to point to RDS
  trial-service:
    environment:
      - AWS_REGION=${AWS_REGION:-ap-south-1}
      - DATABASE_URL=${DATABASE_URL}
    volumes: []
    depends_on: []

  # Override integration-service to point to RDS
  integration-service:
    environment:
      - NODE_ENV=production
      - DB_HOST=${DB_HOST}
      - DB_PORT=${DB_PORT}
      - DB_NAME=${DB_NAME}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${POSTGRES_PASSWORD}
      - DB_SSL=true
    volumes: []
    depends_on: []

  # Remove source volume mounts from other services
  voice-service:
    volumes: []

  nlu-service:
    volumes: []

  telemedicine-service:
    volumes: []
COMPOSE
```

### 8.3 Login to ECR and Pull/Build Images

**Option A: Build locally on EC2** (simpler, no ECR needed initially):

```bash
cd /opt/vaidyah
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

**Option B: Pull from ECR** (after CI/CD pushes images):

```bash
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  $(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-south-1.amazonaws.com
```

### 8.4 Start All Services

```bash
cd /opt/vaidyah
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 8.5 Verify All Containers Are Running

```bash
docker compose ps
```

Expected output — all services should show `Up (healthy)`:

```
NAME                           STATUS
vaidyah-redis                  Up (healthy)
vaidyah-livekit                Up (healthy)
vaidyah-api-gateway            Up (healthy)
vaidyah-voice-service          Up (healthy)
vaidyah-nlu-service            Up (healthy)
vaidyah-clinical-service       Up (healthy)
vaidyah-trial-service          Up (healthy)
vaidyah-integration-service    Up (healthy)
vaidyah-telemedicine-service   Up (healthy)
```

### 8.6 Check Health Endpoints

```bash
# API Gateway (main entry point)
curl -s http://localhost:3000/health | jq .

# All services
for port in 3000 8001 8002 3001 8003 3002 8004; do
  echo -n "Port $port: "
  curl -sf http://localhost:$port/health && echo " OK" || echo " FAIL"
done
```

Expected health response from API Gateway:

```json
{
  "status": "ok",
  "service": "api-gateway",
  "timestamp": "2025-...",
  "uptime": 123.456,
  "dependencies": {
    "postgres": "connected",
    "redis": "connected"
  }
}
```

### 8.7 Service Startup Order

Docker Compose handles dependencies, but for reference, the correct startup order is:

```
1. redis          — no dependencies
2. livekit        — no dependencies
3. postgres       — no dependencies (disabled in prod; using RDS)
4. api-gateway    — depends on: redis, postgres(RDS)
5. voice-service  — no hard dependencies (AWS services)
6. nlu-service    — no hard dependencies (Bedrock)
7. clinical-service — depends on: postgres(RDS)
8. trial-service    — depends on: postgres(RDS)
9. integration-service — depends on: postgres(RDS)
10. telemedicine-service — depends on: livekit
```

---

## 9. Phase 6: Vercel Web App Deployment

### How It Works

The Next.js web app runs on Vercel (free tier). It serves the admin, nurse, and patient portals. All API calls are **server-side proxied** through Next.js rewrites — the browser never talks directly to the EC2 backend.

```
Browser (HTTPS)
    │
    ▼
┌─────────────────────────────┐
│  Vercel (Next.js)           │
│  https://vaidyah.vercel.app │
│                             │
│  /admin/*   → Admin Portal  │
│  /nurse/*   → Nurse Portal  │
│  /patient/* → Patient Portal│
│                             │
│  /api/v1/*  ──rewrites──▶   │──▸ http://<EC2_IP>:3000/api/v1/*
│  /auth/*    ──rewrites──▶   │──▸ http://<EC2_IP>:3000/auth/*
└─────────────────────────────┘
```

The rewrites are defined in `apps/web/next.config.ts`:
- `/api/v1/:path*` → `API_GATEWAY_URL` (EC2 backend)
- `/auth/:path*` → `AUTH_SERVICE_URL` (same EC2 backend)

This means:
- Users see `https://vaidyah.vercel.app/api/v1/health` — HTTPS, no mixed content
- Vercel's edge network proxies the request to `http://<EC2_IP>:3000/api/v1/health`
- No CORS issues (same-origin from browser's perspective)
- Backend IP is never exposed to the browser

### 9.1 Prerequisites

- **Vercel account** — sign up at https://vercel.com (free tier: 100 GB bandwidth/month)
- **Vercel CLI** — install globally:

```bash
npm install -g vercel
```

- **EC2 backend running** — complete Phases 1–5 first, with Docker Compose services up
- **EC2 Elastic IP** — note the public IP of your EC2 instance

### 9.2 Configure the Project on Vercel (Dashboard Method — Recommended)

This method is the simplest for monorepo deployments.

**Step 1: Import from GitHub**

1. Go to https://vercel.com/new
2. Click **Import Git Repository** → select your `vaidyah-claude` repo
3. Vercel will detect it's a monorepo

**Step 2: Configure Build Settings**

| Setting | Value |
|---------|-------|
| **Framework Preset** | Next.js |
| **Root Directory** | `apps/web` |
| **Build Command** | `npm run build` (auto-detected) |
| **Output Directory** | `.next` (auto-detected) |
| **Install Command** | `npm install` |
| **Node.js Version** | 20.x |

> **Important**: Set **Root Directory** to `apps/web`. This tells Vercel to run the build from inside the web app directory, not the monorepo root.

**Step 3: Set Environment Variables**

Before clicking Deploy, add these environment variables:

| Variable | Value | Environments |
|----------|-------|--------------|
| `API_GATEWAY_URL` | `http://<EC2_ELASTIC_IP>:3000` | Production, Preview |
| `AUTH_SERVICE_URL` | `http://<EC2_ELASTIC_IP>:3000` | Production, Preview |

Replace `<EC2_ELASTIC_IP>` with the actual Elastic IP from Terraform output:

```bash
cd infra/terraform && terraform output -raw ec2_public_ip
```

> **Note**: `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_AUTH_BASE_URL` are NOT needed. The client-side code defaults to `/api/v1` and `/auth` (relative paths), which are proxied by the Next.js rewrites to the EC2 backend.

**Step 4: Deploy**

Click **Deploy**. Vercel will:
1. Clone the repo
2. `cd apps/web`
3. Run `npm install` → `npm run build`
4. Deploy the `.next` output to Vercel's edge network

### 9.3 Alternative: Deploy via CLI

```bash
# From the repo root
cd apps/web

# Authenticate
vercel login

# Link to a Vercel project (first time only)
vercel link
```

When prompted:
- **Set up and deploy?** → Yes
- **Which scope?** → Select your account/team
- **Link to existing project?** → No (create new)
- **Project name?** → `vaidyah` (or your preferred name)
- **In which directory is your code located?** → `./` (you're already in `apps/web`)

Set environment variables:

```bash
# Get your EC2 IP
EC2_IP=$(cd ../../infra/terraform && terraform output -raw ec2_public_ip)

# Set env vars for production
vercel env add API_GATEWAY_URL production
# Paste: http://<EC2_IP>:3000

vercel env add AUTH_SERVICE_URL production
# Paste: http://<EC2_IP>:3000
```

Deploy:

```bash
vercel --prod
```

### 9.4 Verify the Deployment

**Step 1: Check the Vercel URL**

Open the URL Vercel prints (e.g., `https://vaidyah.vercel.app`). You should see the login page.

**Step 2: Verify API Connection**

Open browser DevTools (F12) → Network tab, then:

1. Navigate to the admin login page
2. Enter credentials and log in
3. Watch the Network tab — you should see requests to `/auth/login` returning 200

Or test directly:

```bash
# Health check via Vercel proxy (should reach EC2 backend)
curl -s https://vaidyah.vercel.app/api/v1/health | jq .

# Expected response:
# { "status": "ok", "service": "api-gateway", ... }
```

**Step 3: Test Each Portal**

| Portal | URL | Test |
|--------|-----|------|
| Admin | `https://vaidyah.vercel.app/admin/login` | Login with email → Dashboard loads |
| Nurse | `https://vaidyah.vercel.app/nurse/login` | Login with identifier → Patient intake form |
| Patient | `https://vaidyah.vercel.app/patient/login` | OTP flow → Home page loads |

### 9.5 Connect Backend: EC2 CORS Configuration

The EC2 backend must allow requests from Vercel. Update the `.env` file on EC2:

```bash
# SSH into EC2
ssh -i ~/.ssh/vaidyah-key.pem ec2-user@<EC2_IP>

# Edit the environment file
cd /opt/vaidyah
nano .env
```

Add/update the CORS setting:

```bash
CORS_ORIGINS=https://vaidyah.vercel.app,http://localhost:3000,http://localhost:3100
```

If you have a custom domain, include it:

```bash
CORS_ORIGINS=https://vaidyah.vercel.app,https://app.vaidyah.in,http://localhost:3000
```

Restart the API gateway to pick up the change:

```bash
docker compose restart api-gateway
```

> **Note**: Because the web app uses Next.js server-side rewrites, the browser sees requests going to the same origin (Vercel). CORS is technically not needed for the rewrite path. However, if any client-side code makes direct requests (e.g., WebSocket connections for telemedicine), CORS must be configured.

### 9.6 EC2 Security Group: Allow Vercel Requests

Vercel's edge servers need to reach port 3000 on your EC2 instance. Your EC2 security group must allow inbound TCP on port 3000.

```bash
# Option A: Allow from anywhere (simplest — Vercel uses many IPs)
aws ec2 authorize-security-group-ingress \
  --group-id <SECURITY_GROUP_ID> \
  --protocol tcp --port 3000 --cidr 0.0.0.0/0

# Option B: More restrictive — allow only Vercel + your IP
# See https://vercel.com/docs/security/deployment-protection/ip-allowlisting
# for Vercel's current IP ranges
```

> **Security note**: If you restrict port 3000, make sure to also allow your own IP for debugging. The EC2 instance itself is behind a security group — only port 22 (SSH), 3000 (API), and optionally 443 should be open.

### 9.7 Custom Domain (Optional)

1. In **Vercel Dashboard** → your project → **Settings** → **Domains**
2. Add your domain (e.g., `app.vaidyah.in`)
3. Update your DNS provider:
   - **CNAME**: `app` → `cname.vercel-dns.com`
   - Or delegate nameservers to Vercel
4. Vercel automatically provisions an SSL certificate
5. Update `CORS_ORIGINS` on EC2 to include your custom domain
6. Update the CSP `connect-src` by setting `API_GATEWAY_URL` env var in Vercel to your EC2 IP

### 9.8 Automatic Deployments (CI/CD)

Once linked to GitHub, Vercel automatically deploys:
- **Production deploy** on every push to `main`
- **Preview deploy** on every pull request

To also trigger Vercel deploys from the GitHub Actions CD pipeline, add these secrets to your GitHub repo:

| GitHub Secret | Where to Get It |
|---------------|-----------------|
| `VERCEL_TOKEN` | Vercel Dashboard → Settings → Tokens → Create |
| `VERCEL_ORG_ID` | `.vercel/project.json` after `vercel link`, or Vercel Dashboard → Settings → General |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` after `vercel link`, or Vercel Dashboard → Settings → General |

### 9.9 Troubleshooting Vercel ↔ Backend Connection

| Symptom | Cause | Fix |
|---------|-------|-----|
| Login page loads but API calls fail (spinning) | `API_GATEWAY_URL` not set in Vercel | Add env var in Vercel Dashboard → redeploy |
| `502 Bad Gateway` on API calls | EC2 backend not running or port 3000 not reachable | SSH to EC2 → `docker compose ps` → check if api-gateway is healthy |
| `CORS error` in browser console | Direct client-side request (not via rewrite) | Add Vercel domain to `CORS_ORIGINS` on EC2 |
| `Mixed Content` blocked | `API_GATEWAY_URL` uses `http://` but browser is on `https://` | This is fine — rewrites are server-side (Vercel → EC2), not browser → EC2. If you see this, it means client code is bypassing rewrites |
| Login works but data pages show "Failed to fetch" | JWT token not being sent or expired | Check browser DevTools → Application → localStorage for `auth-store` |
| Build fails on Vercel with "module not found" | Root directory not set to `apps/web` | Vercel Dashboard → Settings → General → Root Directory = `apps/web` |
| Build fails with "Cannot find module '@vaidyah/...'" | Workspace dependency issue | The web app is self-contained — no workspace deps needed. Check `package.json` has no `@vaidyah/*` deps |
| Preview deploys use wrong backend | `API_GATEWAY_URL` only set for Production scope | Add the env var for Preview scope too in Vercel Dashboard |

---

## 10. Phase 7: CI/CD Pipeline Setup

The platform uses GitHub Actions for CI/CD:
- **CI** (`ci.yml`): Lint, typecheck, test, build Docker images, security scan — runs on every push/PR
- **CD** (`cd.yml`): Build → push to ECR → deploy to EC2 via SSH + deploy web app to Vercel — runs on merge to `main`

### 10.1 GitHub OIDC for AWS (Recommended)

Instead of storing AWS access keys as secrets, use OpenID Connect:

1. **Create an IAM OIDC Provider** in your AWS account:
   ```bash
   aws iam create-open-id-connect-provider \
     --url "https://token.actions.githubusercontent.com" \
     --client-id-list "sts.amazonaws.com" \
     --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"
   ```

2. **Create an IAM Role** for GitHub Actions:
   ```bash
   cat > github-actions-trust-policy.json <<'POLICY'
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
         },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": {
             "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
           },
           "StringLike": {
             "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/vaidyah:*"
           }
         }
       }
     ]
   }
   POLICY

   aws iam create-role \
     --role-name vaidyah-github-actions \
     --assume-role-policy-document file://github-actions-trust-policy.json
   ```

   Replace `YOUR_ACCOUNT_ID` and `YOUR_ORG/vaidyah` with your actual values.

3. **Attach ECR permissions** to the role:
   ```bash
   aws iam attach-role-policy \
     --role-name vaidyah-github-actions \
     --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
   ```

### 10.2 Configure GitHub Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret Name | Value | How to Get It |
|-------------|-------|---------------|
| `AWS_ACCOUNT_ID` | `123456789012` | `aws sts get-caller-identity --query Account --output text` |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::123456789012:role/vaidyah-github-actions` | From step 10.1 |
| `EC2_HOST` | `13.233.x.x` | `terraform output -raw ec2_public_ip` |
| `EC2_SSH_KEY` | Contents of `vaidyah-key.pem` | `cat vaidyah-key.pem` — paste the entire key including `-----BEGIN/END-----` lines |
| `VERCEL_TOKEN` | `xxxxxx` | Vercel Dashboard → Settings → Tokens → Create |
| `VERCEL_ORG_ID` | `team_xxxxx` | In `.vercel/project.json` after `vercel link`, or Vercel Dashboard → Settings → General → Team ID |
| `VERCEL_PROJECT_ID` | `prj_xxxxx` | In `.vercel/project.json` after `vercel link`, or Vercel Dashboard → Settings → General → Project ID |
| `SLACK_WEBHOOK_URL` | (optional) | Slack app → Incoming Webhooks → add to channel |

### 10.3 How the CD Pipeline Works

When you push to `main`:

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│ Detect       │────▸│ Build Docker │────▸│ Push to   │
│ Changed      │     │ Images       │     │ ECR       │
│ Services     │     └──────────────┘     └─────┬─────┘
└─────────────┘                                 │
                                                ▼
                    ┌──────────────┐     ┌───────────┐
                    │ Smoke Test   │◂────│ Deploy to │
                    │ Health Checks│     │ EC2 (SSH) │
                    └──────┬───────┘     └───────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Slack Notify │
                    └──────────────┘

              ┌──────────────┐
              │ Deploy Web   │  (parallel, if apps/web changed)
              │ to Vercel    │
              └──────────────┘
```

The deployment:
1. Detects which services changed (using `dorny/paths-filter`)
2. Builds only changed services as Docker images
3. Pushes to ECR with tags: `prod-latest` and `prod-<sha>`
4. SSHs into EC2, pulls new images, restarts Docker Compose
5. Runs health checks against `http://<EC2>:3000/health`
6. Sends Slack notification (if webhook configured)
7. If `apps/web` changed, deploys to Vercel in parallel

### 10.4 Manual Deployment

You can trigger a deployment manually from GitHub:

1. Go to **Actions** → **CD** → **Run workflow**
2. Select environment: `dev`, `staging`, or `prod`
3. Optionally specify services: `api-gateway,nlu-service` or `all`

---

## 11. Phase 8: Post-Deployment Verification

### 11.1 End-to-End Health Check

From your local machine:

```bash
EC2_IP=<your-ec2-ip>

# API Gateway
curl -s http://$EC2_IP:3000/health | jq .

# Verify the web app can reach the backend
curl -s https://your-app.vercel.app/api/v1/health
```

### 11.2 Test Authentication

```bash
# Register/login (dev mode with HS256 JWT)
curl -s -X POST http://$EC2_IP:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@vaidyah.in", "password": "admin123"}' | jq .
```

### 11.3 Test NLU Service (Bedrock)

```bash
curl -s -X POST http://$EC2_IP:3000/api/v1/nlu/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{"text": "patient has fever and headache for 3 days", "language": "en"}' | jq .
```

### 11.4 Test Trial Search

```bash
curl -s "http://$EC2_IP:3000/api/v1/trials/search?q=diabetes&page=1&size=5" \
  -H "Authorization: Bearer <jwt-token>" | jq .
```

---

## 12. Service Reference

### Service Ports & Health Endpoints

| Service | Port | Health Endpoint | Response |
|---------|------|----------------|----------|
| api-gateway | 3000 | `GET /health` | `{"status":"ok","service":"api-gateway","dependencies":{"postgres":"connected","redis":"connected"}}` |
| voice-service | 8001 | `GET /health` | `{"status":"ok","service":"voice-service"}` |
| nlu-service | 8002 | `GET /health` | `{"status":"ok","service":"nlu-service","bedrock_model":"anthropic.claude-3-haiku-..."}` |
| clinical-service | 3001 | `GET /health` | `{"status":"ok","service":"clinical-service"}` |
| trial-service | 8003 | `GET /health` | `{"status":"ok","service":"trial-service","trials_indexed":N}` |
| integration-service | 3002 | `GET /health` | `{"status":"ok","service":"integration-service"}` |
| telemedicine-service | 8004 | `GET /health` | `{"status":"ok","service":"telemedicine-service","livekit":"connected"}` |
| redis | 6379 | `redis-cli ping` | `PONG` |
| livekit | 7880 | HTTP GET `/` | HTTP 200 |

### API Routes (via API Gateway)

| Route | Proxied To | Purpose |
|-------|-----------|---------|
| `POST /auth/login` | api-gateway | JWT login |
| `POST /auth/register` | api-gateway | User registration |
| `GET /api/v1/sessions` | api-gateway | List consultation sessions |
| `POST /api/v1/sessions` | api-gateway | Create new session |
| `POST /api/v1/voice/transcribe` | voice-service | Speech-to-text |
| `POST /api/v1/voice/synthesize` | voice-service | Text-to-speech |
| `POST /api/v1/nlu/analyze` | nlu-service | Medical NLU analysis |
| `POST /api/v1/clinical/triage` | clinical-service | Triage assessment |
| `GET /api/v1/clinical/soap/:id` | clinical-service | SOAP note retrieval |
| `GET /api/v1/trials/search` | trial-service | Clinical trial search |
| `POST /api/v1/trials/match` | trial-service | Patient-trial matching |
| `GET /api/v1/integration/abdm/*` | integration-service | ABDM health records |
| `POST /api/v1/telemedicine/room` | telemedicine-service | Create video call room |
| `GET /api/v1/dashboard/*` | api-gateway | Admin analytics |

---

## 13. Environment Variables Reference

### Required Variables

| Variable | Service(s) | Description | Example |
|----------|-----------|-------------|---------|
| `POSTGRES_PASSWORD` | all DB services | Database password | `xK9m2...` |
| `JWT_SECRET` | api-gateway, clinical, telemedicine | JWT signing key (HS256) | `a1b2c3...` (64 hex chars) |
| `DB_HOST` | api-gateway, integration | RDS hostname | `vaidyah-prod-db.xxx.rds.amazonaws.com` |
| `DB_PORT` | api-gateway, integration | Database port | `5432` |
| `DB_NAME` | api-gateway, integration | Database name | `vaidyah` |
| `DB_USER` | api-gateway, integration | Database user | `vaidyah_admin` |
| `DATABASE_URL` | clinical, trial | Full PostgreSQL URL | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `AWS_REGION` | voice, nlu, trial | AWS region | `ap-south-1` |
| `LIVEKIT_API_KEY` | telemedicine, livekit | LiveKit auth key | `vaidyah_abc123` |
| `LIVEKIT_API_SECRET` | telemedicine, livekit | LiveKit auth secret | `a1b2c3...` (64 hex chars) |

### Optional Variables

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `BEDROCK_MODEL_ID` | nlu-service | `anthropic.claude-3-haiku-20240307-v1:0` | NLU model |
| `BEDROCK_ML_MODEL_ID` | api-gateway | `anthropic.claude-3-haiku-20240307-v1:0` | ML inference model |
| `S3_AUDIO_BUCKET` | voice-service | `vaidyah-voice-recordings` | S3 bucket for recordings |
| `DB_SSL` | api-gateway, integration | `false` | Enable SSL for DB |
| `DB_SSL_MODE` | clinical | `prefer` | SSL mode (prefer/require) |
| `CORS_ORIGINS` | telemedicine | `http://localhost:3001` | Allowed CORS origins |
| `LIVEKIT_WS_URL` | telemedicine | `ws://localhost:7880` | LiveKit WebSocket URL |
| `NODE_ENV` | Node services | `development` | Environment mode |
| `REDIS_HOST` | api-gateway | `redis` | Redis hostname |
| `REDIS_PORT` | api-gateway | `6379` | Redis port |
| `ABDM_BASE_URL` | integration | `https://dev.abdm.gov.in` | ABDM API base URL |
| `ABDM_CLIENT_ID` | integration | (empty) | ABDM OAuth client ID |
| `ABDM_CLIENT_SECRET` | integration | (empty) | ABDM OAuth client secret |
| `WHATSAPP_API_URL` | integration | (empty) | WhatsApp Business API URL |
| `WHATSAPP_API_TOKEN` | integration | (empty) | WhatsApp API token |

---

## 14. Database Schema Reference

### Tables (26 total)

Created by `init.sql`:

| Table | Created By | Description |
|-------|-----------|-------------|
| `health_centers` | init.sql | Healthcare facility registry (8 seeded) |
| `users` | init.sql | System users — admin, doctor, nurse, etc. (10 seeded) |
| `patients` | init.sql | Patient demographics and medical history (8 seeded) |
| `consultations` | init.sql | Consultation records with vitals, symptoms, SOAP, AI scores (8 seeded) |
| `clinical_trials` | init.sql | Clinical trial data with full-text search |
| `alerts` | init.sql | Multi-type alert system (6 seeded) |
| `audit_log` | init.sql | HIPAA-compliant audit trail |
| `consultation_sessions` | init.sql | Active consultation session tracking |
| `session_vitals` | init.sql | Vitals recorded per consultation session |
| `emergency_alerts` | init.sql | Emergency alert tracking with GPS |
| `triage_results` | init.sql | AI triage assessment results |
| `soap_notes` | init.sql | AI-generated SOAP clinical notes |
| `whatsapp_messages` | init.sql | WhatsApp message log |
| `wearable_connections` | init.sql | Wearable device OAuth connections |
| `wearable_data` | init.sql | Synced wearable health data |
| `health_alerts` | init.sql | Patient health alerts from wearables |
| `scheduled_notifications` | init.sql | Notification scheduling queue |

Created by services at startup:

| Table | Created By | Description |
|-------|-----------|-------------|
| `trials` | trial-service | Trial search index with `search_vector` tsvector |
| `trial_matches` | trial-service | Patient ↔ trial match results |
| `notifications` | trial-service | Trial notification delivery tracking |
| `subscriptions` | trial-service | Patient trial alert subscriptions |

### Enums

| Enum | Values |
|------|--------|
| `user_role` | super_admin, state_admin, district_admin, center_admin, doctor, nurse, pharmacist, lab_tech, asha_worker, patient, researcher, system |
| `consultation_status` | in_progress, completed, referred, emergency, cancelled |
| `triage_level` | A, B, C, D, E |
| `urgency_level` | low, medium, high, critical |
| `trial_status` | not_yet_recruiting, recruiting, active_not_recruiting, completed, suspended, terminated, withdrawn |
| `alert_type` | emergency, trial_match, health_alert, medication_reminder, follow_up |

### Row-Level Security

RLS is enabled on all PHI tables. Each connection must set session variables:

```sql
SET app.current_user_id = '<uuid>';
SET app.current_role    = 'nurse';
SET app.current_center_id = '<uuid>';
SET app.current_patient_id = '<uuid>';   -- for patient role
```

---

## 15. Monitoring & Logging

### 15.1 Docker Logs

```bash
# Follow all service logs
docker compose logs -f

# Follow specific service
docker compose logs -f api-gateway

# Last 100 lines from all services
docker compose logs --tail=100

# Show timestamps
docker compose logs -f --timestamps nlu-service
```

### 15.2 CloudWatch (via Terraform)

Terraform creates a CloudWatch dashboard named `vaidyah-prod-dashboard` with:
- EC2 CPU, memory, disk utilization
- RDS connections, CPU, free storage
- Custom application metrics (if configured)

CloudWatch alarms are configured for:
- EC2 CPU > 80% for 5 minutes → SNS alert
- RDS free storage < 2 GB → SNS alert
- RDS CPU > 80% for 10 minutes → SNS alert

To view in the AWS Console:
1. Go to **CloudWatch** → **Dashboards**
2. Select `vaidyah-prod-dashboard`

### 15.3 Subscribe to Alerts

```bash
# Subscribe your email to system alerts
aws sns subscribe \
  --topic-arn $(terraform output -raw sns_system_alerts_topic_arn) \
  --protocol email \
  --notification-endpoint your-email@example.com

# Subscribe to emergency alerts
aws sns subscribe \
  --topic-arn $(terraform output -raw sns_emergency_alerts_topic_arn) \
  --protocol email \
  --notification-endpoint your-email@example.com
```

Confirm the subscription by clicking the link in the confirmation email.

### 15.4 Quick Health Check Script

Create this on the EC2 instance for quick status checks:

```bash
cat > /opt/vaidyah/check-health.sh <<'SCRIPT'
#!/bin/bash
echo "=== Vaidyah Health Check ==="
echo ""

SERVICES=("api-gateway:3000" "voice-service:8001" "nlu-service:8002" "clinical-service:3001" "trial-service:8003" "integration-service:3002" "telemedicine-service:8004")

for svc in "${SERVICES[@]}"; do
  NAME="${svc%%:*}"
  PORT="${svc##*:}"
  STATUS=$(curl -sf --max-time 3 "http://localhost:$PORT/health" 2>/dev/null)
  if [ $? -eq 0 ]; then
    echo "  ✓ $NAME (:$PORT) — healthy"
  else
    echo "  ✗ $NAME (:$PORT) — UNHEALTHY"
  fi
done

echo ""
echo "=== Docker Status ==="
docker compose ps --format "table {{.Name}}\t{{.Status}}"

echo ""
echo "=== Resource Usage ==="
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
SCRIPT

chmod +x /opt/vaidyah/check-health.sh
```

Run with: `/opt/vaidyah/check-health.sh`

---

## 16. Troubleshooting

### Service Won't Start

```bash
# Check logs for the failing service
docker compose logs --tail=50 <service-name>

# Common issues:
# 1. "POSTGRES_PASSWORD is required" → Check .env file exists and has the variable
# 2. "ECONNREFUSED" to postgres → DB_HOST is wrong or RDS security group blocks access
# 3. "Cannot find module" → Rebuild the image: docker compose build <service>
```

### Database Connection Fails

```bash
# Test from EC2 → RDS connectivity
PGPASSWORD=$POSTGRES_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1;"

# If this fails, check:
# 1. RDS security group allows inbound from EC2 security group on port 5432
# 2. RDS is in a private subnet routable from the EC2's VPC
# 3. DB_HOST, DB_USER, POSTGRES_PASSWORD are correct
```

### Bedrock Returns Errors

```bash
# Test Bedrock access from EC2
aws bedrock-runtime invoke-model \
  --model-id "anthropic.claude-3-haiku-20240307-v1:0" \
  --content-type "application/json" \
  --accept "application/json" \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"Say hello"}]}' \
  /dev/stdout

# If "AccessDeniedException":
# 1. Check EC2 IAM role has bedrock:InvokeModel permission
# 2. Check model access is granted in Bedrock console
# 3. Check region matches (ap-south-1)
```

### Web App Shows "Failed to Fetch" or CORS Errors

1. Verify `API_GATEWAY_URL` is set correctly in Vercel env vars
2. Verify EC2 port 3000 is accessible: `curl http://<EC2_IP>:3000/health`
3. Check the API gateway logs: `docker compose logs api-gateway`
4. If CORS error, update `CORS_ORIGINS` in `.env` to include your Vercel domain

### Services Running But Slow

```bash
# Check resource usage
docker stats --no-stream

# If memory is near the 2GB limit (t3.small):
# 1. Consider upgrading to t3.medium (4GB RAM, ~$30/mo)
# 2. Or reduce workers: edit Dockerfile CMD to use --workers 1
```

### Restarting a Single Service

```bash
docker compose restart api-gateway
# or rebuild and restart:
docker compose up -d --build api-gateway
```

### Recreating Everything from Scratch

```bash
cd /opt/vaidyah
docker compose down
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Viewing Database Content

```bash
source /opt/vaidyah/.env
PGPASSWORD=$POSTGRES_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME

# Useful queries:
\dt                                    -- list all tables
SELECT COUNT(*) FROM patients;         -- count patients
SELECT COUNT(*) FROM consultations;    -- count consultations
SELECT * FROM users WHERE role = 'nurse';  -- list nurses
```

---

## 17. Maintenance & Operations

### 17.1 Updating Services

**Via CI/CD (recommended):**
1. Push changes to `main` branch
2. CD pipeline automatically builds, pushes to ECR, and deploys to EC2

**Manual update:**
```bash
ssh -i vaidyah-key.pem ec2-user@$EC2_IP
cd /opt/vaidyah
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### 17.2 Database Backups

RDS automated backups are configured (3-day retention by default). To create a manual snapshot:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier vaidyah-prod-db \
  --db-snapshot-identifier vaidyah-backup-$(date +%Y%m%d)
```

To restore from a snapshot:
```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier vaidyah-prod-db-restored \
  --db-snapshot-identifier vaidyah-backup-20250308
```

### 17.3 Rotate JWT Secret

1. Generate a new secret: `openssl rand -hex 32`
2. Update `/opt/vaidyah/.env` with the new `JWT_SECRET`
3. Restart services: `docker compose restart api-gateway clinical-service telemedicine-service`
4. Note: All existing JWT tokens will be invalidated — users will need to log in again

### 17.4 Rotate Database Password

1. Update the password in AWS Secrets Manager
2. Update the RDS master password:
   ```bash
   aws rds modify-db-instance \
     --db-instance-identifier vaidyah-prod-db \
     --master-user-password NEW_PASSWORD
   ```
3. Update `/opt/vaidyah/.env` with the new password in `POSTGRES_PASSWORD` and `DATABASE_URL`
4. Restart all services: `docker compose restart`

### 17.5 EC2 Instance Maintenance

```bash
# Update OS packages
sudo dnf update -y

# Clean up unused Docker images (free disk space)
docker system prune -f
docker image prune -a --filter "until=168h"  # Remove images older than 7 days

# Check disk usage
df -h /
docker system df
```

### 17.6 SSL/TLS Setup (Recommended for Production)

For HTTPS on the API Gateway (currently HTTP on port 3000):

**Option A: Nginx reverse proxy with Let's Encrypt**

```bash
sudo dnf install -y nginx certbot python3-certbot-nginx

# Configure Nginx as reverse proxy
sudo cat > /etc/nginx/conf.d/vaidyah.conf <<'NGINX'
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

sudo systemctl enable nginx && sudo systemctl start nginx

# Get SSL certificate
sudo certbot --nginx -d api.your-domain.com
```

**Option B: Use Vercel as the sole entry point** (already HTTPS)

The web app on Vercel already proxies API requests via `next.config.ts` rewrites. This means users never directly access the EC2 IP — all traffic goes through Vercel's HTTPS.

### 17.7 Importing Clinical Trials Data

```bash
# CSV import via the trial-service API
curl -X POST http://localhost:8003/api/v1/trials/csv-ingest \
  -F "file=@/opt/vaidyah/clinical-trials.csv"

# Or from the mounted volume (if using docker-compose default)
docker compose exec trial-service python -c "
import asyncio
from app.routers.csv_ingest import ingest_csv
asyncio.run(ingest_csv('/data/clinical-trials.csv'))
"
```

---

## 18. Scaling Up

When you outgrow the budget setup:

| Need | Action | New Cost |
|------|--------|----------|
| More users / memory | Upgrade EC2 to t3.medium (4GB) | +$15/mo |
| Even more users | Upgrade to t3.large (8GB) | +$45/mo |
| More DB storage | RDS auto-scales to 50GB (configured) | +$5-10/mo |
| Better ML accuracy | Change `BEDROCK_MODEL_ID` to `anthropic.claude-3-5-sonnet-20241022-v2:0` | +$20-50/mo |
| High availability | Add RDS multi-AZ | +$10/mo |
| Full production | Re-enable EKS, OpenSearch, Cognito from git history | $500+/mo |

To upgrade EC2:

```bash
# Stop the instance
aws ec2 stop-instances --instance-ids <instance-id>

# Change instance type
aws ec2 modify-instance-attribute \
  --instance-id <instance-id> \
  --instance-type '{"Value": "t3.medium"}'

# Start the instance
aws ec2 start-instances --instance-ids <instance-id>

# Re-associate Elastic IP if needed
aws ec2 associate-address --instance-id <instance-id> --allocation-id <eip-alloc-id>
```

---

## 19. Local Development Setup

### 19.1 Clone and Install

```bash
git clone https://github.com/YOUR_ORG/vaidyah.git
cd vaidyah
npm install   # Installs all workspace dependencies
```

### 19.2 Environment Setup

```bash
cp .env.example .env
# Edit .env — for local dev, the defaults mostly work:
# - DB connects to localhost:5432 (Docker postgres)
# - JWT_SECRET can be any string
# - AWS services fall back to mock data without credentials
```

Set at minimum:
```
POSTGRES_PASSWORD=localdevpassword
JWT_SECRET=dev-secret-do-not-use-in-production
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret123456789012345678901234
```

### 19.3 Start Services with Docker Compose

```bash
# Start everything (builds images on first run)
docker compose up -d

# Watch logs
docker compose logs -f
```

This starts:
- PostgreSQL 16 on port 5432 (with auto-initialized schema via `init.sql`)
- Redis 7 on port 6379
- LiveKit on port 7880
- All 7 backend services on their respective ports

### 19.4 Start the Web App (Development Mode)

```bash
cd apps/web
npm run dev
# Opens http://localhost:3100 (Next.js dev server)
```

The web app's `next.config.ts` proxies `/api/v1/*` and `/auth/*` to `http://localhost:3000` (the API gateway running in Docker).

### 19.5 Seed Data

The database is automatically seeded with sample data when PostgreSQL initializes for the first time (via `init.sql` mounted in Docker). This includes:
- 8 health centers in Bihar
- 10 users (admins, doctors, nurses)
- 8 patients
- 8 consultations with full vitals and AI scores
- 6 sample alerts

### 19.6 Reset Database

If you need to reset the database:

```bash
docker compose down -v          # Remove volumes (deletes all data)
docker compose up -d postgres   # Recreate with fresh init.sql
docker compose up -d            # Start everything else
```

### 19.7 Running Tests

```bash
# All tests (via Turborepo)
npm test

# Specific service
cd services/api-gateway && npm test
cd services/trial-service && pytest -v

# With coverage
cd services/nlu-service && pytest --cov=app --cov-report=term-missing
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    VAIDYAH QUICK REFERENCE                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SSH into EC2:                                              │
│    ssh -i vaidyah-key.pem ec2-user@<EC2_IP>                │
│                                                             │
│  Start services:                                            │
│    docker compose -f docker-compose.yml \                   │
│      -f docker-compose.prod.yml up -d                       │
│                                                             │
│  Stop services:                                             │
│    docker compose down                                      │
│                                                             │
│  View logs:                                                 │
│    docker compose logs -f <service>                         │
│                                                             │
│  Health check:                                              │
│    curl http://localhost:3000/health                        │
│                                                             │
│  Connect to DB:                                             │
│    source .env && PGPASSWORD=$POSTGRES_PASSWORD psql \      │
│      -h $DB_HOST -U $DB_USER -d $DB_NAME                   │
│                                                             │
│  Deploy (auto):                                             │
│    git push origin main                                     │
│                                                             │
│  Deploy web app (manual):                                   │
│    cd apps/web && vercel --prod                             │
│                                                             │
│  Restart single service:                                    │
│    docker compose restart <service>                         │
│                                                             │
│  Clean up Docker:                                           │
│    docker system prune -f                                   │
│                                                             │
│  Check resource usage:                                      │
│    docker stats --no-stream                                 │
│                                                             │
│  Terraform changes:                                         │
│    cd infra/terraform && terraform plan && terraform apply  │
│                                                             │
│  Service ports:                                             │
│    API Gateway    :3000    Voice       :8001                │
│    NLU            :8002    Clinical    :3001                │
│    Trials         :8003    Integration :3002                │
│    Telemedicine   :8004    Redis       :6379                │
│    LiveKit        :7880                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
