# Vaidyah Healthcare Platform - Local Development Setup (Windows)

Step-by-step guide to run the entire Vaidyah platform locally on Windows for development.

---

## Table of Contents

1. [Prerequisites](#step-1-prerequisites)
2. [Clone and Install](#step-2-clone-and-install)
3. [Start Infrastructure with Docker](#step-3-start-infrastructure-with-docker)
4. [Environment Configuration](#step-4-environment-configuration)
5. [Option A: All Services via Docker (Easiest)](#step-5-option-a-all-services-via-docker)
6. [Option B: Run Services Locally (Best for Development)](#step-6-option-b-run-services-locally)
7. [Start Frontend Apps](#step-7-start-frontend-apps)
8. [Verify Everything Works](#step-8-verify-everything-works)
9. [Running Tests](#step-9-running-tests)
10. [Common Development Tasks](#step-10-common-development-tasks)
11. [Troubleshooting (Windows-Specific)](#step-11-troubleshooting)

---

## Step 1: Prerequisites

### 1.1 Install Required Software

| Tool | Version | Install |
|------|---------|---------|
| Git | Latest | https://git-scm.com/download/win (select "Git Bash" during install) |
| Node.js | >= 20.0.0 | https://nodejs.org/ (LTS, use the `.msi` installer) |
| Python | 3.11.x | https://www.python.org/downloads/ (**check "Add to PATH"** during install) |
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop/ |
| VS Code | Latest | https://code.visualstudio.com/ (recommended editor) |

**Docker Desktop requirements:**
- Windows 11 (or Windows 10 21H2+)
- WSL 2 backend enabled (Docker Desktop installer handles this)
- At least 8 GB RAM (16 GB recommended — Docker will use ~4 GB for infrastructure containers)
- At least 10 GB free disk space

### 1.2 Verify Installations

Open **Git Bash** or **PowerShell** and run:

```bash
git --version          # git version 2.x
node --version         # v20.x.x or higher
npm --version          # 10.x.x or higher
python --version       # Python 3.11.x
docker --version       # Docker version 24+ or 27+
docker compose version # Docker Compose version v2.x
```

### 1.3 Configure Git Line Endings

Windows uses `\r\n` line endings, but the codebase uses `\n`. Configure Git to handle this:

```bash
git config --global core.autocrlf input
```

### 1.4 Docker Desktop Settings

Open Docker Desktop > Settings:
- **General:** Ensure "Use the WSL 2 based engine" is checked
- **Resources > Memory:** Set to at least **4 GB** (6 GB recommended)
- **Resources > CPU:** At least 2 cores
- Ensure Docker Desktop is running before proceeding

---

## Step 2: Clone and Install

### 2.1 Clone the Repository

```bash
git clone <repository-url>
cd vaidyah_claude
```

### 2.2 Install Node.js Dependencies

```bash
npm install
```

This installs dependencies for the entire monorepo (all `apps/*`, `packages/*`, `services/*` workspaces).

### 2.3 Build Shared Packages

Other workspaces depend on these shared packages, so build them first:

```bash
npx turbo run build --filter=@vaidyah/shared-types --filter=@vaidyah/medical-ontology
```

---

## Step 3: Start Infrastructure with Docker

The `docker-compose.yml` defines four infrastructure services that all backend services depend on.

### 3.1 Start Infrastructure Containers

```bash
docker compose up -d postgres dynamodb-local opensearch redis
```

This starts:

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| vaidyah-postgres | postgres:16-alpine | 5432 | Primary database (auto-initializes schema via `scripts/init.sql`) |
| vaidyah-dynamodb | amazon/dynamodb-local | 8000 | Session/voice chunk storage |
| vaidyah-opensearch | opensearch:2.12.0 | 9200 | Clinical trial search |
| vaidyah-redis | redis:7-alpine | 6379 | Caching, rate limiting, pub/sub |

### 3.2 Wait for Health Checks

```bash
# Check PostgreSQL is ready
docker exec vaidyah-postgres pg_isready -U vaidyah
# Expected: /var/run/postgresql:5432 - accepting connections

# Check Redis
docker exec vaidyah-redis redis-cli ping
# Expected: PONG

# Check OpenSearch (may take 30-60 seconds to start)
curl http://localhost:9200
# Expected: JSON with cluster info

# Check DynamoDB Local
curl http://localhost:8000
# Expected: {"__type":"com.amazonaws.dynamodb.v20120810#MissingAuthenticationToken"...}
# (This error response is normal — it means the service is running)
```

### 3.3 Verify Database Schema

The PostgreSQL schema (`scripts/init.sql`) is automatically applied when the container starts for the first time:

```bash
docker exec vaidyah-postgres psql -U vaidyah -d vaidyah -c "\dt"
```

Expected output — 8 tables:

```
              List of relations
 Schema |      Name       | Type  |  Owner
--------+-----------------+-------+---------
 public | alerts          | table | vaidyah
 public | audit_log       | table | vaidyah
 public | clinical_trials | table | vaidyah
 public | consultations   | table | vaidyah
 public | health_centers  | table | vaidyah
 public | patients        | table | vaidyah
 public | trial_matches   | table | vaidyah
 public | users           | table | vaidyah
```

If tables are missing, re-run the init script:

```bash
docker exec -i vaidyah-postgres psql -U vaidyah -d vaidyah < scripts/init.sql
```

---

## Step 4: Environment Configuration

### 4.1 Create Root `.env` File

Copy the example and fill in values:

```bash
cp .env.example .env
```

For local development, most defaults work. The key values to set:

```env
# .env (root)

# AWS - only needed if testing AWS-dependent features (voice, NLU, trials)
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-key-here
AWS_SECRET_ACCESS_KEY=your-secret-here

# Database (matches docker-compose.yml)
DATABASE_URL=postgresql://vaidyah:vaidyah_dev_pwd@localhost:5432/vaidyah

# Local infrastructure
DYNAMODB_ENDPOINT=http://localhost:8000
OPENSEARCH_ENDPOINT=http://localhost:9200
REDIS_URL=redis://localhost:6379

# Service URLs (for local-to-local communication)
VOICE_SERVICE_URL=http://localhost:8001
NLU_SERVICE_URL=http://localhost:8002
CLINICAL_SERVICE_URL=http://localhost:3001
TRIAL_SERVICE_URL=http://localhost:8003
INTEGRATION_SERVICE_URL=http://localhost:3002

# JWT (any random string for local dev)
JWT_SECRET=local-dev-jwt-secret-change-in-production

# AWS AI/ML services (leave blank to use mocks/stubs)
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=

NODE_ENV=development
```

### 4.2 Web App `.env.local`

```bash
cp apps/web/.env.example apps/web/.env.local
```

Ensure it contains:

```env
NEXT_PUBLIC_API_BASE_URL=/api/v1
NEXT_PUBLIC_AUTH_BASE_URL=/auth
API_GATEWAY_URL=http://localhost:3000
```

**Note:** AWS credentials are only required if you want to test AWS-dependent features like voice transcription (AWS Transcribe), NLU (Bedrock), or text-to-speech (Polly). Without them, those specific endpoints will return errors, but the rest of the platform works fine.

---

## Step 5: Option A: All Services via Docker (Easiest)

This starts everything (infrastructure + all 6 backend services) in Docker. Simplest to get running, but slower feedback loop for code changes.

### 5.1 Build and Start Everything

```bash
docker compose up -d --build
```

### 5.2 Verify Services

```bash
docker compose ps
```

All 10 containers should show `Up` status:

| Container | Port | Status |
|-----------|------|--------|
| vaidyah-postgres | 5432 | Up (healthy) |
| vaidyah-dynamodb | 8000 | Up |
| vaidyah-opensearch | 9200 | Up |
| vaidyah-redis | 6379 | Up |
| vaidyah-api-gateway | 3000 | Up |
| vaidyah-voice-service | 8001 | Up |
| vaidyah-nlu-service | 8002 | Up |
| vaidyah-clinical-service | 3001 | Up |
| vaidyah-trial-service | 8003 | Up |
| vaidyah-integration-service | 3002 | Up |

### 5.3 Hot Reload in Docker

The `docker-compose.yml` mounts source directories as volumes, so code changes are reflected inside containers:

- Node.js services mount `./services/<name>/src:/app/src` (requires `ts-node-dev` which auto-restarts)
- Python services mount `./services/<name>/app:/app/app` (requires `uvicorn --reload` flag)

To rebuild a single service after dependency changes:

```bash
docker compose up -d --build api-gateway
```

### 5.4 View Logs

```bash
# All services
docker compose logs -f

# Single service
docker compose logs -f api-gateway

# Last 50 lines
docker compose logs --tail 50 clinical-service
```

### 5.5 Stop Everything

```bash
docker compose down          # Stop containers, keep data
docker compose down -v       # Stop containers AND delete data volumes
```

Skip to [Step 7](#step-7-start-frontend-apps) if using this option.

---

## Step 6: Option B: Run Services Locally (Best for Development)

Run infrastructure in Docker but services natively for faster iteration, better debugging, and IDE integration.

### 6.1 Ensure Infrastructure is Running

```bash
docker compose up -d postgres dynamodb-local opensearch redis
```

### 6.2 Start Node.js Services

Each Node.js service has a `dev` script that uses `ts-node-dev` with hot reload.

Open **three separate terminals** (Git Bash, PowerShell, or VS Code terminal):

**Terminal 1 — API Gateway (port 3000):**

```bash
cd services/api-gateway
npm run dev
```

**Terminal 2 — Clinical Service (port 3001):**

```bash
cd services/clinical-service
npm run dev
```

**Terminal 3 — Integration Service (port 3002):**

```bash
cd services/integration-service
npm run dev
```

Each service will print `Listening on port XXXX` when ready. `ts-node-dev` automatically restarts on file changes.

**Environment variables:** These services read from the root `.env` file (via `dotenv`) and from `docker-compose.yml` environment when running in Docker. When running locally, ensure your root `.env` has the correct `DATABASE_URL`, `REDIS_URL`, etc.

### 6.3 Start Python Services

Each Python service needs its own virtual environment. The `uvloop` dependency in voice-service is **Linux-only** — it will fail to install on Windows. Use `--no-deps` and install manually, or simply skip it (uvicorn falls back to asyncio automatically).

**Terminal 4 — Voice Service (port 8001):**

```bash
cd services/voice-service

# Create virtual environment
python -m venv .venv

# Activate it (Git Bash)
source .venv/Scripts/activate
# OR (PowerShell)
# .venv\Scripts\Activate.ps1

# Install dependencies (skip uvloop which is Linux-only)
pip install -r requirements.txt 2>&1 | findstr /V "uvloop" || pip install --ignore-installed -r requirements.txt
# If uvloop errors out, install everything else manually:
# pip install fastapi uvicorn boto3 numpy librosa soundfile pydantic pydantic-settings python-dotenv httpx aiofiles structlog python-multipart PyJWT aioboto3 aiohttp cachetools tenacity prometheus-client

# Note: librosa requires libsndfile. If it fails, install it:
# pip install soundfile  (includes prebuilt libsndfile for Windows)

# Start the service
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**Terminal 5 — NLU Service (port 8002):**

```bash
cd services/nlu-service
python -m venv .venv
source .venv/Scripts/activate   # Git Bash
# .venv\Scripts\Activate.ps1    # PowerShell

pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
```

**Terminal 6 — Trial Service (port 8003):**

```bash
cd services/trial-service
python -m venv .venv
source .venv/Scripts/activate   # Git Bash
# .venv\Scripts\Activate.ps1    # PowerShell

pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8003 --reload
```

### 6.4 Quick Start Script (Optional)

To avoid opening 6+ terminals, you can use the Turborepo dev command which starts all Node.js services in parallel:

```bash
# From the repo root — starts all workspaces that have a "dev" script
npm run dev
```

This uses Turborepo to run `dev` across all workspaces concurrently. However, it **does not** start the Python services — those must be started separately as shown above.

---

## Step 7: Start Frontend Apps

### 7.1 Web App (Next.js — port 3100)

```bash
cd apps/web
npm run dev
```

Open http://localhost:3100 in your browser.

The web app serves all three portals:
- **Admin Portal:** http://localhost:3100/admin
- **Nurse Portal:** http://localhost:3100/nurse
- **Patient Portal:** http://localhost:3100/patient

### 7.2 Admin Portal (Legacy Vite App — port 5173)

The standalone admin portal (React + Vite) can also be run separately:

```bash
cd apps/admin-portal
npm run dev
```

Open http://localhost:5173.

### 7.3 Mobile Apps (Expo)

For mobile app development, you need the Expo CLI:

```bash
# Install Expo CLI globally (if not already)
npm install -g expo-cli

# Nurse Tablet App
cd apps/nurse-tablet
npx expo start

# Patient Mobile App (in a separate terminal)
cd apps/patient-mobile
npx expo start
```

Use the Expo Go app on your phone or an Android/iOS emulator to test.

---

## Step 8: Verify Everything Works

### 8.1 Service Health Checks

Once all services are running, verify each one:

```bash
# API Gateway
curl http://localhost:3000/health

# Clinical Service
curl http://localhost:3001/health

# Integration Service
curl http://localhost:3002/health

# Voice Service
curl http://localhost:8001/health

# NLU Service
curl http://localhost:8002/health

# Trial Service
curl http://localhost:8003/health
```

Each should return a JSON response with `"status": "healthy"` or similar.

### 8.2 Database Connectivity

```bash
# Connect to PostgreSQL directly
docker exec -it vaidyah-postgres psql -U vaidyah -d vaidyah -c "SELECT count(*) FROM health_centers;"

# Check OpenSearch
curl http://localhost:9200/_cluster/health?pretty

# Check Redis
docker exec vaidyah-redis redis-cli info server | head -5
```

### 8.3 End-to-End Test

```bash
# Test the API Gateway routing to clinical service
curl http://localhost:3000/api/v1/health

# Test trial search (if trial-service is running)
curl "http://localhost:8003/api/v1/trials/search?query=diabetes&page=1&page_size=5"
```

---

## Step 9: Running Tests

### 9.1 Run All Tests

```bash
# From repo root
npm test
```

This uses Turborepo to run `test` across all workspaces.

### 9.2 Run Tests for a Specific Service

```bash
# Node.js services
cd services/api-gateway
npm test

cd services/clinical-service
npm test

# Python services (activate venv first)
cd services/voice-service
source .venv/Scripts/activate
pytest

cd services/trial-service
source .venv/Scripts/activate
pytest
```

### 9.3 Lint and Typecheck

```bash
# All workspaces
npm run lint

# Specific workspace
npx turbo run typecheck --filter=@vaidyah/api-gateway
```

---

## Step 10: Common Development Tasks

### 10.1 Reset Database

```bash
# Drop and recreate (deletes ALL data)
docker exec -i vaidyah-postgres psql -U vaidyah -d vaidyah -c "
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  GRANT ALL ON SCHEMA public TO vaidyah;
"
docker exec -i vaidyah-postgres psql -U vaidyah -d vaidyah < scripts/init.sql
```

### 10.2 Reset All Docker Volumes

```bash
docker compose down -v
docker compose up -d postgres dynamodb-local opensearch redis
```

### 10.3 Rebuild a Single Docker Service

```bash
docker compose up -d --build --force-recreate api-gateway
```

### 10.4 View Container Resource Usage

```bash
docker stats --no-stream
```

### 10.5 Access PostgreSQL Shell

```bash
docker exec -it vaidyah-postgres psql -U vaidyah -d vaidyah
```

### 10.6 Access Redis CLI

```bash
docker exec -it vaidyah-redis redis-cli
```

### 10.7 Rebuild Shared Packages After Changes

If you modify `packages/shared-types` or `packages/medical-ontology`:

```bash
npx turbo run build --filter=@vaidyah/shared-types --filter=@vaidyah/medical-ontology
```

---

## Step 11: Troubleshooting (Windows-Specific)

### Port Conflicts

If a port is already in use:

```bash
# Find what's using port 5432 (PowerShell)
netstat -ano | findstr :5432

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

Common conflicts:
- **5432:** Another PostgreSQL instance
- **3000:** Other Node.js apps, Create React App
- **6379:** Another Redis instance
- **9200:** Another Elasticsearch/OpenSearch instance

### Docker Desktop Issues

**"Docker Desktop is not running":**
- Start Docker Desktop from the Start Menu
- Wait for the whale icon in the system tray to stop animating

**"Cannot connect to Docker daemon":**
```bash
# Restart Docker Desktop via PowerShell
& "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

**Containers exit immediately:**
```bash
# Check logs for the failing container
docker compose logs postgres
docker compose logs opensearch
```

**OpenSearch fails to start (memory):**
OpenSearch requires significant memory. If it crashes, increase Docker Desktop memory allocation (Settings > Resources > Memory > 6 GB+), or reduce the JVM heap:

```bash
# In docker-compose.yml, change:
# OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m
# to:
# OPENSEARCH_JAVA_OPTS=-Xms256m -Xmx256m
```

### `uvloop` Installation Failure

The `uvloop` package in `services/voice-service/requirements.txt` is **Linux-only**. On Windows, you'll see:

```
error: uvloop does not support Windows
```

This is safe to ignore. Remove `uvloop` from `requirements.txt` locally, or install the other packages manually. Uvicorn falls back to the default `asyncio` event loop on Windows — it works fine for development.

### `librosa` / `soundfile` Issues

If `librosa` fails to install:

```bash
# Install soundfile first (includes prebuilt libsndfile for Windows)
pip install soundfile
pip install librosa
```

If you still get `libsndfile not found` errors, install the [libsndfile Windows binary](https://github.com/libsndfile/libsndfile/releases) and add it to PATH.

### Line Ending Issues

If you see `\r` characters in error messages or scripts fail:

```bash
# Fix line endings for a specific file
sed -i 's/\r$//' scripts/init.sql

# Or configure Git to handle this globally
git config --global core.autocrlf input
```

### Node.js `node_modules` Path Length

Windows has a 260-character path limit. If `npm install` fails with path-too-long errors:

```bash
# Enable long paths (requires admin PowerShell)
# Run PowerShell as Administrator:
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

Then restart your terminal and re-run `npm install`.

### Python Virtual Environment Activation (PowerShell)

If PowerShell blocks venv activation:

```powershell
# Allow script execution (run once as Administrator)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Then activate normally
.venv\Scripts\Activate.ps1
```

### Services Can't Connect to Docker Infrastructure

If Node.js/Python services running locally can't reach PostgreSQL, Redis, etc.:

- Ensure containers are running: `docker compose ps`
- Ensure `.env` uses `localhost` (not Docker service names like `postgres` or `redis`)
- Docker service names (`postgres`, `redis`, etc.) only work between Docker containers, not from host

Correct `.env` values for locally-run services:
```env
DATABASE_URL=postgresql://vaidyah:vaidyah_dev_pwd@localhost:5432/vaidyah
REDIS_URL=redis://localhost:6379
OPENSEARCH_ENDPOINT=http://localhost:9200
DYNAMODB_ENDPOINT=http://localhost:8000
```

### Slow Docker Performance

Docker on Windows can be slower than on Linux. Tips:
- Use WSL 2 backend (default in Docker Desktop)
- Clone the repo inside WSL 2 filesystem (`\\wsl$\Ubuntu\home\...`) for faster volume mounts
- Exclude the project folder from Windows Defender real-time scanning:
  - Windows Security > Virus & threat protection > Manage settings > Exclusions > Add exclusion > Folder

---

## Quick Reference

### Service Ports

| Service | Port | Type | Dev Command |
|---------|------|------|-------------|
| PostgreSQL | 5432 | Docker | `docker compose up -d postgres` |
| DynamoDB Local | 8000 | Docker | `docker compose up -d dynamodb-local` |
| OpenSearch | 9200 | Docker | `docker compose up -d opensearch` |
| Redis | 6379 | Docker | `docker compose up -d redis` |
| API Gateway | 3000 | Node.js | `npm run dev` (in `services/api-gateway/`) |
| Clinical Service | 3001 | Node.js | `npm run dev` (in `services/clinical-service/`) |
| Integration Service | 3002 | Node.js | `npm run dev` (in `services/integration-service/`) |
| Voice Service | 8001 | Python | `uvicorn app.main:app --port 8001 --reload` |
| NLU Service | 8002 | Python | `uvicorn app.main:app --port 8002 --reload` |
| Trial Service | 8003 | Python | `uvicorn app.main:app --port 8003 --reload` |
| Web App (Next.js) | 3100 | Node.js | `npm run dev` (in `apps/web/`) |
| Admin Portal (Vite) | 5173 | Node.js | `npm run dev` (in `apps/admin-portal/`) |

### Docker Database Credentials

| Database | Host | Port | User | Password | Database |
|----------|------|------|------|----------|----------|
| PostgreSQL | localhost | 5432 | vaidyah | vaidyah_dev_pwd | vaidyah |
| DynamoDB | localhost | 8000 | (none) | (none) | (shared) |
| OpenSearch | localhost | 9200 | (none) | (none) | (security disabled) |
| Redis | localhost | 6379 | (none) | (none) | default |

### Useful Commands Cheatsheet

```bash
# Start infra only
docker compose up -d postgres dynamodb-local opensearch redis

# Start everything (infra + services)
docker compose up -d --build

# Stop everything, keep data
docker compose down

# Nuclear reset (delete all data)
docker compose down -v

# View logs
docker compose logs -f <service-name>

# Run all tests
npm test

# Build all
npm run build

# Lint all
npm run lint

# Build shared packages
npx turbo run build --filter=@vaidyah/shared-types --filter=@vaidyah/medical-ontology
```
