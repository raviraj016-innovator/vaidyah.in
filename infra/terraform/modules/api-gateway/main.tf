###############################################################################
# Vaidyah Healthcare Platform - API Gateway Module
###############################################################################

locals {
  name_prefix       = "${var.project_name}-${var.environment}"
  custom_domain     = var.domain_name != "" && var.certificate_arn != ""
  vpc_link_enabled  = length(var.private_subnet_ids) > 0
  cognito_issuer    = regex("arn:aws:cognito-idp:([^:]+):[^:]+:userpool/(.+)", var.cognito_user_pool_arns[0])
  cognito_region    = local.cognito_issuer[0]
  cognito_pool_id   = local.cognito_issuer[1]
  jwt_issuer        = "https://cognito-idp.${local.cognito_region}.amazonaws.com/${local.cognito_pool_id}"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ── HTTP API ────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "this" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers  = ["Authorization", "Content-Type", "X-Amz-Date", "X-Api-Key", "X-Request-Id"]
    allow_methods  = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_origins = var.domain_name != "" ? [
      "https://${var.domain_name}",
      "https://admin.${var.domain_name}",
      "https://app.${var.domain_name}",
    ] : ["http://localhost:3000", "http://localhost:3001"]
    expose_headers = ["X-Request-Id", "X-Correlation-Id"]
    max_age        = 3600
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-api"
  })
}

# ── Cognito JWT Authorizer ──────────────────────────────────────────────────

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.this.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${local.name_prefix}-cognito-authorizer"

  jwt_configuration {
    audience = var.cognito_client_ids
    issuer   = local.jwt_issuer
  }
}

# ── VPC Link ────────────────────────────────────────────────────────────────

resource "aws_security_group" "vpc_link" {
  count = local.vpc_link_enabled ? 1 : 0

  name_prefix = "${local.name_prefix}-apigw-vpclink-"
  description = "Security group for API Gateway VPC Link"
  vpc_id      = var.vpc_id

  egress {
    description = "All outbound to VPC"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-apigw-vpclink-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_apigatewayv2_vpc_link" "this" {
  count = local.vpc_link_enabled ? 1 : 0

  name               = "${local.name_prefix}-vpc-link"
  subnet_ids         = var.private_subnet_ids
  security_group_ids = [aws_security_group.vpc_link[0].id]

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-vpc-link"
  })
}

# ── Default Integration & Route ─────────────────────────────────────────────

resource "aws_apigatewayv2_integration" "default" {
  api_id             = aws_apigatewayv2_api.this.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  integration_uri    = "https://placeholder.internal"

  connection_type = local.vpc_link_enabled ? "VPC_LINK" : "INTERNET"
  connection_id   = local.vpc_link_enabled ? aws_apigatewayv2_vpc_link.this[0].id : null

  request_parameters = {
    "overwrite:header.X-Forwarded-For" = "$request.header.X-Forwarded-For"
  }
}

resource "aws_apigatewayv2_route" "default" {
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = "$default"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  target             = "integrations/${aws_apigatewayv2_integration.default.id}"
}

# ── CloudWatch Log Groups ──────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "access_logs" {
  for_each = toset(var.stage_names)

  name              = "/aws/apigateway/${local.name_prefix}-api/${each.value}"
  retention_in_days = 30

  tags = var.tags
}

# ── Stages ──────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_stage" "this" {
  for_each = toset(var.stage_names)

  api_id      = aws_apigatewayv2_api.this.id
  name        = each.value
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access_logs[each.value].arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      caller           = "$context.identity.caller"
      user             = "$context.identity.user"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      resourcePath     = "$context.resourcePath"
      status           = "$context.status"
      protocol         = "$context.protocol"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
      errorMessage     = "$context.error.message"
      authorizerError  = "$context.authorizer.error"
    })
  }

  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }

  tags = merge(var.tags, {
    Name  = "${local.name_prefix}-api-${each.value}"
    Stage = each.value
  })
}

# ── WAF WebACL ──────────────────────────────────────────────────────────────

resource "aws_wafv2_web_acl" "this" {
  name        = "${local.name_prefix}-api-waf"
  description = "WAF WebACL for Vaidyah API Gateway - HIPAA protection"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-sqli-rules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimitRule"
    priority = 4

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-api-waf"
    sampled_requests_enabled   = true
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-api-waf"
  })
}

resource "aws_wafv2_web_acl_association" "this" {
  for_each = toset(var.stage_names)

  resource_arn = aws_apigatewayv2_stage.this[each.value].arn
  web_acl_arn  = aws_wafv2_web_acl.this.arn
}

# ── Custom Domain ───────────────────────────────────────────────────────────

resource "aws_apigatewayv2_domain_name" "this" {
  count = local.custom_domain ? 1 : 0

  domain_name = "api.${var.domain_name}"

  domain_name_configuration {
    certificate_arn = var.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-api-domain"
  })
}

resource "aws_apigatewayv2_api_mapping" "this" {
  for_each = local.custom_domain ? toset(var.stage_names) : toset([])

  api_id          = aws_apigatewayv2_api.this.id
  domain_name     = aws_apigatewayv2_domain_name.this[0].id
  stage           = aws_apigatewayv2_stage.this[each.value].id
  api_mapping_key = each.value
}

# ── Route53 Alias Record ───────────────────────────────────────────────────

data "aws_route53_zone" "this" {
  count = local.custom_domain ? 1 : 0

  name         = var.domain_name
  private_zone = false
}

resource "aws_route53_record" "api" {
  count = local.custom_domain ? 1 : 0

  zone_id = data.aws_route53_zone.this[0].zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.this[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.this[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
