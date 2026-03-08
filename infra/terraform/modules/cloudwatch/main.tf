###############################################################################
# Vaidyah Healthcare Platform - CloudWatch Module
# Log groups, custom metrics, alarms, dashboards, and metric filters.
###############################################################################

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  region      = data.aws_region.current.name

  services = [
    "api-gateway",
    "clinical-service",
    "integration-service",
    "voice-service",
    "nlu-service",
    "trial-service",
  ]
}

# ── Log Groups for All Services ──────────────────────────────────────────

resource "aws_cloudwatch_log_group" "services" {
  for_each = toset(local.services)

  name              = "/vaidyah/${var.environment}/${each.value}"
  retention_in_days = var.environment == "prod" ? 90 : 30
  kms_key_id        = var.kms_key_arn

  tags = merge(var.tags, {
    Name    = "${local.name_prefix}-${each.value}-logs"
    Service = each.value
  })
}

# Application-level log group
resource "aws_cloudwatch_log_group" "application" {
  name              = "/vaidyah/${var.environment}/application"
  retention_in_days = var.environment == "prod" ? 90 : 30
  kms_key_id        = var.kms_key_arn

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-application-logs"
  })
}

# ── Metric Filters for Error Patterns ────────────────────────────────────

resource "aws_cloudwatch_log_metric_filter" "error_count" {
  for_each = toset(local.services)

  name           = "${local.name_prefix}-${each.value}-errors"
  log_group_name = aws_cloudwatch_log_group.services[each.value].name
  pattern        = "{ $.level = \"error\" || $.level = \"ERROR\" }"

  metric_transformation {
    name      = "${each.value}-ErrorCount"
    namespace = "Vaidyah"
    value     = "1"
  }
}

resource "aws_cloudwatch_log_metric_filter" "critical_error" {
  for_each = toset(local.services)

  name           = "${local.name_prefix}-${each.value}-critical"
  log_group_name = aws_cloudwatch_log_group.services[each.value].name
  pattern        = "{ $.level = \"fatal\" || $.level = \"FATAL\" || $.message = \"*CRITICAL*\" }"

  metric_transformation {
    name      = "${each.value}-CriticalErrorCount"
    namespace = "Vaidyah"
    value     = "1"
  }
}

resource "aws_cloudwatch_log_metric_filter" "emergency_alert" {
  for_each = toset(local.services)

  name           = "${local.name_prefix}-${each.value}-emergency"
  log_group_name = aws_cloudwatch_log_group.services[each.value].name
  pattern        = "{ $.eventType = \"emergency.detected\" || $.message = \"*emergency*\" }"

  metric_transformation {
    name      = "${each.value}-EmergencyAlertCount"
    namespace = "Vaidyah"
    value     = "1"
  }
}

resource "aws_cloudwatch_log_metric_filter" "circuit_breaker" {
  for_each = toset(local.services)

  name           = "${local.name_prefix}-${each.value}-circuit-breaker"
  log_group_name = aws_cloudwatch_log_group.services[each.value].name
  pattern        = "{ $.message = \"*circuit*breaker*open*\" || $.circuitBreakerState = \"open\" }"

  metric_transformation {
    name      = "${each.value}-CircuitBreakerOpenCount"
    namespace = "Vaidyah"
    value     = "1"
  }
}

resource "aws_cloudwatch_log_metric_filter" "latency" {
  for_each = toset(local.services)

  name           = "${local.name_prefix}-${each.value}-latency"
  log_group_name = aws_cloudwatch_log_group.services[each.value].name
  pattern        = "{ $.responseTime > 0 }"

  metric_transformation {
    name      = "${each.value}-ResponseTime"
    namespace = "Vaidyah"
    value     = "$.responseTime"
  }
}

# ── Alarms ───────────────────────────────────────────────────────────────

# High Error Rate Alarm (per service)
resource "aws_cloudwatch_metric_alarm" "high_error_rate" {
  for_each = toset(local.services)

  alarm_name          = "${local.name_prefix}-${each.value}-high-error-rate"
  alarm_description   = "High error rate detected for ${each.value} in ${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ErrorCount"
  namespace           = "Vaidyah"
  period              = 300
  statistic           = "Sum"
  threshold           = var.error_rate_threshold
  treat_missing_data  = "notBreaching"

  dimensions = {
    Service     = each.value
    Environment = var.environment
  }

  alarm_actions = var.alarm_sns_topic_arns
  ok_actions    = var.alarm_sns_topic_arns

  tags = merge(var.tags, {
    Name     = "${local.name_prefix}-${each.value}-high-error-rate"
    Severity = "warning"
    Service  = each.value
  })
}

# High Latency Alarm (per service)
resource "aws_cloudwatch_metric_alarm" "high_latency" {
  for_each = toset(local.services)

  alarm_name          = "${local.name_prefix}-${each.value}-high-latency"
  alarm_description   = "High latency detected for ${each.value} in ${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ResponseTime"
  namespace           = "Vaidyah"
  period              = 300
  extended_statistic   = "p99"
  threshold           = var.latency_threshold_ms
  treat_missing_data  = "notBreaching"

  dimensions = {
    Service     = each.value
    Environment = var.environment
  }

  alarm_actions = var.alarm_sns_topic_arns

  tags = merge(var.tags, {
    Name     = "${local.name_prefix}-${each.value}-high-latency"
    Severity = "warning"
    Service  = each.value
  })
}

# Emergency Alert Alarm (critical - any service)
resource "aws_cloudwatch_metric_alarm" "emergency_alerts" {
  alarm_name          = "${local.name_prefix}-emergency-alerts-fired"
  alarm_description   = "Emergency alerts detected across Vaidyah services in ${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "total_emergencies"
    expression  = "SUM(METRICS())"
    label       = "Total Emergency Alerts"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = toset(local.services)
    content {
      id = "e_${replace(metric_query.value, "-", "_")}"
      metric {
        metric_name = "EmergencyAlertCount"
        namespace   = "Vaidyah"
        period      = 60
        stat        = "Sum"
        dimensions = {
          Service     = metric_query.value
          Environment = var.environment
        }
      }
    }
  }

  alarm_actions = var.critical_alarm_sns_topic_arns

  tags = merge(var.tags, {
    Name     = "${local.name_prefix}-emergency-alerts"
    Severity = "critical"
  })
}

# Circuit Breaker Alarm
resource "aws_cloudwatch_metric_alarm" "circuit_breaker" {
  alarm_name          = "${local.name_prefix}-circuit-breaker-open"
  alarm_description   = "Circuit breaker opened in Vaidyah services in ${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "total_cb"
    expression  = "SUM(METRICS())"
    label       = "Total Circuit Breaker Opens"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = toset(local.services)
    content {
      id = "cb_${replace(metric_query.value, "-", "_")}"
      metric {
        metric_name = "CircuitBreakerOpenCount"
        namespace   = "Vaidyah"
        period      = 300
        stat        = "Sum"
        dimensions = {
          Service     = metric_query.value
          Environment = var.environment
        }
      }
    }
  }

  alarm_actions = var.alarm_sns_topic_arns

  tags = merge(var.tags, {
    Name     = "${local.name_prefix}-circuit-breaker-open"
    Severity = "high"
  })
}

# ── Dashboard ────────────────────────────────────────────────────────────

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.name_prefix}-overview"

  dashboard_body = jsonencode({
    widgets = concat(
      # Row 1: Error counts per service
      [
        {
          type   = "metric"
          x      = 0
          y      = 0
          width  = 12
          height = 6
          properties = {
            title   = "Error Count by Service"
            view    = "timeSeries"
            stacked = true
            region  = local.region
            metrics = [
              for svc in local.services :
              ["Vaidyah", "ErrorCount", "Service", svc, "Environment", var.environment, { label = svc }]
            ]
            period = 300
          }
        },
        {
          type   = "metric"
          x      = 12
          y      = 0
          width  = 12
          height = 6
          properties = {
            title   = "Response Time p99 by Service"
            view    = "timeSeries"
            stacked = false
            region  = local.region
            metrics = [
              for svc in local.services :
              ["Vaidyah", "ResponseTime", "Service", svc, "Environment", var.environment, { stat = "p99", label = "${svc} p99" }]
            ]
            period = 300
          }
        }
      ],
      # Row 2: Emergency alerts and circuit breakers
      [
        {
          type   = "metric"
          x      = 0
          y      = 6
          width  = 12
          height = 6
          properties = {
            title   = "Emergency Alerts"
            view    = "timeSeries"
            stacked = true
            region  = local.region
            metrics = [
              for svc in local.services :
              ["Vaidyah", "EmergencyAlertCount", "Service", svc, "Environment", var.environment, { label = svc }]
            ]
            period = 60
          }
        },
        {
          type   = "metric"
          x      = 12
          y      = 6
          width  = 12
          height = 6
          properties = {
            title   = "Circuit Breaker Opens"
            view    = "timeSeries"
            stacked = true
            region  = local.region
            metrics = [
              for svc in local.services :
              ["Vaidyah", "CircuitBreakerOpenCount", "Service", svc, "Environment", var.environment, { label = svc }]
            ]
            period = 300
          }
        }
      ],
      # Row 3: Critical errors and alarm status
      [
        {
          type   = "metric"
          x      = 0
          y      = 12
          width  = 12
          height = 6
          properties = {
            title   = "Critical Errors"
            view    = "timeSeries"
            stacked = true
            region  = local.region
            metrics = [
              for svc in local.services :
              ["Vaidyah", "CriticalErrorCount", "Service", svc, "Environment", var.environment, { label = svc }]
            ]
            period = 300
          }
        },
        {
          type   = "alarm"
          x      = 12
          y      = 12
          width  = 12
          height = 6
          properties = {
            title = "Alarm Status"
            alarms = concat(
              [for svc in local.services : aws_cloudwatch_metric_alarm.high_error_rate[svc].arn],
              [
                aws_cloudwatch_metric_alarm.emergency_alerts.arn,
                aws_cloudwatch_metric_alarm.circuit_breaker.arn,
              ]
            )
          }
        }
      ]
    )
  })
}
