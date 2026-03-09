###############################################################################
# Vaidyah Healthcare Platform - Budget Deployment (~$50-60/month)
#
# Architecture: Single EC2 + RDS micro + S3 + Bedrock Haiku
# Web app deployed on Vercel (free tier)
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

# ── KMS Key for Encryption ──────────────────────────────────────────────────

module "kms" {
  source = "./modules/kms"

  project_name = var.project_name
  environment  = var.environment
  admin_role_arns = [
    "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
  ]
  service_role_arns = [aws_iam_role.ec2_role.arn]
  tags              = local.common_tags
}

# ── RDS PostgreSQL (db.t3.micro — single-AZ, ~$10/month) ────────────────────

module "rds" {
  source = "./modules/rds"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  eks_security_group_id = aws_security_group.ec2_sg.id
  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  multi_az              = false
  backup_retention      = var.rds_backup_retention_period
  database_name         = var.rds_database_name
  master_username       = var.rds_master_username
  kms_key_arn           = module.kms.phi_key_arn
  tags                  = local.common_tags
}

# ── S3 Buckets ───────────────────────────────────────────────────────────────

module "s3" {
  source = "./modules/s3"

  project_name         = var.project_name
  environment          = var.environment
  kms_key_arn          = module.kms.phi_key_arn
  cors_allowed_origins = var.cors_allowed_origins
  tags                 = local.common_tags
}

# ── Secrets Manager ──────────────────────────────────────────────────────────

module "secrets_manager" {
  source = "./modules/secrets-manager"

  project_name       = var.project_name
  environment        = var.environment
  kms_key_arn        = module.kms.phi_key_arn
  vpc_id             = module.vpc.vpc_id
  db_master_username = var.rds_master_username
  db_host            = module.rds.db_endpoint
  db_port            = 5432
  db_name            = var.rds_database_name
  tags               = local.common_tags
}

# ── SNS (Notifications) ─────────────────────────────────────────────────────

module "sns" {
  source = "./modules/sns"

  project_name = var.project_name
  environment  = var.environment
  kms_key_id   = module.kms.phi_key_id
  tags         = local.common_tags
}

# ── CloudWatch (Basic monitoring) ────────────────────────────────────────────

module "cloudwatch" {
  source = "./modules/cloudwatch"

  project_name         = var.project_name
  environment          = var.environment
  kms_key_arn          = module.kms.phi_key_arn
  error_rate_threshold = 20
  latency_threshold_ms = 10000
  alarm_sns_topic_arns          = [module.sns.system_alerts_topic_arn]
  critical_alarm_sns_topic_arns = [module.sns.emergency_alerts_topic_arn, module.sns.system_alerts_topic_arn]
  tags = local.common_tags
}

# ── EC2 Instance (t3.small — runs all Docker services, ~$15/month) ───────────

resource "aws_iam_role" "ec2_role" {
  name = "${local.name_prefix}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "ec2_policy" {
  name = "${local.name_prefix}-ec2-policy"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BedrockAccess"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:bedrock:${data.aws_region.current.name}::foundation-model/*"
      },
      {
        Sid    = "TranscribeAccess"
        Effect = "Allow"
        Action = [
          "transcribe:StartStreamTranscription",
          "transcribe:StartMedicalStreamTranscription"
        ]
        Resource = "*"
      },
      {
        Sid    = "PollyAccess"
        Effect = "Allow"
        Action = ["polly:SynthesizeSpeech"]
        Resource = "*"
      },
      {
        Sid    = "S3Access"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"]
        Resource = [
          module.s3.voice_bucket_arn,
          "${module.s3.voice_bucket_arn}/*",
          module.s3.documents_bucket_arn,
          "${module.s3.documents_bucket_arn}/*",
          module.s3.images_bucket_arn,
          "${module.s3.images_bucket_arn}/*",
        ]
      },
      {
        Sid    = "SNSPublish"
        Effect = "Allow"
        Action = ["sns:Publish"]
        Resource = [
          module.sns.emergency_alerts_topic_arn,
          module.sns.consultation_updates_topic_arn,
          module.sns.system_alerts_topic_arn,
        ]
      },
      {
        Sid    = "SecretsManagerRead"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:${var.project_name}/*"
      },
      {
        Sid    = "KMSDecrypt"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:Encrypt",
          "kms:GenerateDataKey*"
        ]
        Resource = [module.kms.phi_key_arn]
      },
      {
        Sid    = "SSMAccess"
        Effect = "Allow"
        Action = [
          "ssm:UpdateInstanceInformation",
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel",
          "ec2messages:AcknowledgeMessage",
          "ec2messages:DeleteMessage",
          "ec2messages:FailMessage",
          "ec2messages:GetEndpoint",
          "ec2messages:GetMessages",
          "ec2messages:SendReply"
        ]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      },
      {
        Sid    = "ECRPull"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "${local.name_prefix}-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

resource "aws_security_group" "ec2_sg" {
  name_prefix = "${local.name_prefix}-ec2-"
  vpc_id      = module.vpc.vpc_id

  # SSH access (restrict to your IP in production)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_allowed_cidrs
    description = "SSH access"
  }

  # API Gateway port
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "API Gateway"
  }

  # HTTPS (for reverse proxy)
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS"
  }

  # LiveKit WebSocket
  ingress {
    from_port   = 7880
    to_port     = 7882
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "LiveKit"
  }

  ingress {
    from_port   = 7882
    to_port     = 7882
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "LiveKit UDP"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-ec2-sg" })
}

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.ec2_instance_type
  subnet_id              = module.vpc.public_subnet_ids[0]
  vpc_security_group_ids = [aws_security_group.ec2_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name
  key_name               = var.ec2_key_pair_name != "" ? var.ec2_key_pair_name : null

  root_block_device {
    volume_size           = 30
    volume_type           = "gp3"
    encrypted             = true
    kms_key_id            = module.kms.phi_key_arn
    delete_on_termination = true
  }

  user_data = <<-EOF
    #!/bin/bash
    set -e

    # Install Docker
    dnf update -y
    dnf install -y docker git
    systemctl enable docker && systemctl start docker
    usermod -aG docker ec2-user

    # Install Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose

    # Install SSM agent for remote access without SSH
    dnf install -y amazon-ssm-agent
    systemctl enable amazon-ssm-agent && systemctl start amazon-ssm-agent

    # Install CloudWatch agent for log shipping
    dnf install -y amazon-cloudwatch-agent

    echo "Vaidyah EC2 instance ready"
  EOF

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-app" })
}

resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"
  tags     = merge(local.common_tags, { Name = "${local.name_prefix}-eip" })
}

# ── ECR Repositories ────────────────────────────────────────────────────────

resource "aws_ecr_repository" "services" {
  for_each = toset([
    "api-gateway",
    "clinical-service",
    "integration-service",
    "voice-service",
    "nlu-service",
    "trial-service",
    "telemedicine-service",
  ])

  name                 = "${var.project_name}/${each.key}"
  image_tag_mutability = "MUTABLE"
  force_delete         = var.environment != "prod"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = module.kms.phi_key_arn
  }

  tags = local.common_tags
}

# Lifecycle policy: keep only last 5 images per repo
resource "aws_ecr_lifecycle_policy" "cleanup" {
  for_each   = aws_ecr_repository.services
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}
