data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_security_group" "opensearch" {
  name_prefix = "${var.project_name}-${var.environment}-opensearch-"
  description = "Security group for OpenSearch domain"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTPS from EKS nodes"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [var.eks_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-opensearch"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_opensearch_domain" "this" {
  domain_name    = "${var.project_name}-${var.environment}"
  engine_version = var.engine_version

  cluster_config {
    instance_type  = var.instance_type
    instance_count = var.instance_count

    dedicated_master_enabled = var.dedicated_master_enabled
    dedicated_master_type    = var.dedicated_master_type
    dedicated_master_count   = var.dedicated_master_count

    zone_awareness_enabled = var.instance_count > 1

    dynamic "zone_awareness_config" {
      for_each = var.instance_count > 1 ? [1] : []
      content {
        availability_zone_count = min(var.instance_count, length(var.private_subnet_ids))
      }
    }
  }

  vpc_options {
    subnet_ids         = var.instance_count > 1 ? slice(var.private_subnet_ids, 0, min(var.instance_count, length(var.private_subnet_ids))) : [var.private_subnet_ids[0]]
    security_group_ids = [aws_security_group.opensearch.id]
  }

  ebs_options {
    ebs_enabled = true
    volume_size = var.volume_size
    volume_type = "gp3"
  }

  encrypt_at_rest {
    enabled    = true
    kms_key_id = var.kms_key_arn
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  snapshot_options {
    automated_snapshot_start_hour = 3
  }

  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = var.opensearch_access_role_arns
        }
        Action   = ["es:ESHttpGet", "es:ESHttpPost", "es:ESHttpHead", "es:ESHttpPut", "es:ESHttpDelete", "es:ESHttpPatch"]
        Resource = "arn:aws:es:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:domain/${var.project_name}-${var.environment}/*"
      }
    ]
  })

  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch_audit.arn
    log_type                 = "AUDIT_LOGS"
    enabled                  = true
  }

  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch_app.arn
    log_type                 = "ES_APPLICATION_LOGS"
    enabled                  = true
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "opensearch_audit" {
  name              = "/aws/opensearch/${var.project_name}-${var.environment}/audit"
  retention_in_days = 90
  tags              = var.tags
}

resource "aws_cloudwatch_log_group" "opensearch_app" {
  name              = "/aws/opensearch/${var.project_name}-${var.environment}/application"
  retention_in_days = 30
  tags              = var.tags
}

resource "aws_cloudwatch_log_resource_policy" "opensearch_logs" {
  policy_name     = "${var.project_name}-${var.environment}-opensearch-logs"
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "es.amazonaws.com"
        }
        Action = [
          "logs:PutLogEvents",
          "logs:CreateLogStream",
        ]
        Resource = [
          "${aws_cloudwatch_log_group.opensearch_audit.arn}:*",
          "${aws_cloudwatch_log_group.opensearch_app.arn}:*",
        ]
      }
    ]
  })
}

resource "aws_iam_service_linked_role" "opensearch" {
  count            = var.create_service_linked_role ? 1 : 0
  aws_service_name = "opensearchservice.amazonaws.com"
}
