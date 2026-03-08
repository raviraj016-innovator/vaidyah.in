###############################################################################
# Vaidyah Healthcare Platform - SNS Module
# Topics for notifications, alerts, and platform applications for mobile push.
###############################################################################

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  account_id  = data.aws_caller_identity.current.account_id
  region      = data.aws_region.current.name
}

# ── SNS Topics ────────────────────────────────────────────────────────────

resource "aws_sns_topic" "emergency_alerts" {
  name              = "${local.name_prefix}-emergency-alerts"
  display_name      = "Vaidyah Emergency Alerts"
  kms_master_key_id = var.kms_key_id

  delivery_policy = jsonencode({
    http = {
      defaultHealthyRetryPolicy = {
        minDelayTarget     = 1
        maxDelayTarget     = 60
        numRetries         = 10
        numMaxDelayRetries = 3
        numMinDelayRetries = 0
        backoffFunction    = "exponential"
      }
      disableSubscriptionOverrides = false
    }
  })

  tags = merge(var.tags, {
    Name     = "${local.name_prefix}-emergency-alerts"
    Priority = "critical"
  })
}

resource "aws_sns_topic" "consultation_updates" {
  name              = "${local.name_prefix}-consultation-updates"
  display_name      = "Vaidyah Consultation Updates"
  kms_master_key_id = var.kms_key_id

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-consultation-updates"
  })
}

resource "aws_sns_topic" "trial_matches" {
  name              = "${local.name_prefix}-trial-matches"
  display_name      = "Vaidyah Trial Matches"
  kms_master_key_id = var.kms_key_id

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-trial-matches"
  })
}

resource "aws_sns_topic" "system_alerts" {
  name              = "${local.name_prefix}-system-alerts"
  display_name      = "Vaidyah System Alerts"
  kms_master_key_id = var.kms_key_id

  tags = merge(var.tags, {
    Name     = "${local.name_prefix}-system-alerts"
    Priority = "high"
  })
}

resource "aws_sns_topic" "patient_reminders" {
  name              = "${local.name_prefix}-patient-reminders"
  display_name      = "Vaidyah Patient Reminders"
  kms_master_key_id = var.kms_key_id

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-patient-reminders"
  })
}

resource "aws_sns_topic" "wearable_alerts" {
  name              = "${local.name_prefix}-wearable-alerts"
  display_name      = "Vaidyah Wearable Alerts"
  kms_master_key_id = var.kms_key_id

  tags = merge(var.tags, {
    Name     = "${local.name_prefix}-wearable-alerts"
    Priority = "high"
  })
}

# ── Topic Policies ────────────────────────────────────────────────────────

resource "aws_sns_topic_policy" "emergency_alerts" {
  arn = aws_sns_topic.emergency_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowAccountPublish"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${local.account_id}:root"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.emergency_alerts.arn
      },
      {
        Sid    = "AllowEventBridgePublish"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.emergency_alerts.arn
      },
      {
        Sid    = "AllowCloudWatchAlarmsPublish"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.emergency_alerts.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })
}

resource "aws_sns_topic_policy" "system_alerts" {
  arn = aws_sns_topic.system_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowAccountPublish"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${local.account_id}:root"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.system_alerts.arn
      },
      {
        Sid    = "AllowCloudWatchAlarmsPublish"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.system_alerts.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })
}

# ── Platform Applications for Push Notifications ──────────────────────────

resource "aws_sns_platform_application" "apns" {
  count = var.apns_platform_credential != "" ? 1 : 0

  name                = "${local.name_prefix}-ios-apns"
  platform            = var.environment == "prod" ? "APNS" : "APNS_SANDBOX"
  platform_credential = var.apns_platform_credential
  platform_principal  = var.apns_platform_principal

  event_delivery_failure_topic_arn = aws_sns_topic.system_alerts.arn
  event_endpoint_created_topic_arn = aws_sns_topic.system_alerts.arn
  event_endpoint_deleted_topic_arn = aws_sns_topic.system_alerts.arn
  event_endpoint_updated_topic_arn = aws_sns_topic.system_alerts.arn
}

resource "aws_sns_platform_application" "gcm" {
  count = var.gcm_api_key != "" ? 1 : 0

  name                = "${local.name_prefix}-android-gcm"
  platform            = "GCM"
  platform_credential = var.gcm_api_key

  event_delivery_failure_topic_arn = aws_sns_topic.system_alerts.arn
  event_endpoint_created_topic_arn = aws_sns_topic.system_alerts.arn
  event_endpoint_deleted_topic_arn = aws_sns_topic.system_alerts.arn
  event_endpoint_updated_topic_arn = aws_sns_topic.system_alerts.arn
}

# ── SMS Preferences ──────────────────────────────────────────────────────

resource "aws_sns_sms_preferences" "this" {
  default_sms_type    = "Transactional"
  monthly_spend_limit = var.sms_monthly_spend_limit
  default_sender_id   = "VAIDYAH"
}

# ── IAM Role for Delivery Status Logging ──────────────────────────────────

resource "aws_iam_role" "sns_delivery_status" {
  name = "${local.name_prefix}-sns-delivery-status"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "sns_delivery_status" {
  name = "${local.name_prefix}-sns-delivery-status"
  role = aws_iam_role.sns_delivery_status.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:PutMetricFilter",
          "logs:PutRetentionPolicy"
        ]
        Resource = "arn:aws:logs:${local.region}:${local.account_id}:log-group:sns/${local.region}/${local.account_id}/*"
      }
    ]
  })
}

# ── CloudWatch Alarms for Delivery Failures ───────────────────────────────

resource "aws_cloudwatch_metric_alarm" "emergency_alerts_failure" {
  alarm_name          = "${local.name_prefix}-emergency-alerts-delivery-failure"
  alarm_description   = "Emergency alert SNS delivery failures detected"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "NumberOfNotificationsFailed"
  namespace           = "AWS/SNS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    TopicName = aws_sns_topic.emergency_alerts.name
  }

  alarm_actions = [aws_sns_topic.system_alerts.arn]
  ok_actions    = [aws_sns_topic.system_alerts.arn]

  tags = merge(var.tags, {
    Name     = "${local.name_prefix}-emergency-alerts-delivery-failure"
    Severity = "critical"
  })
}

resource "aws_cloudwatch_metric_alarm" "sms_spend_alarm" {
  alarm_name          = "${local.name_prefix}-sms-spend-high"
  alarm_description   = "SMS spending approaching monthly limit"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "SMSMonthToDateSpentUSD"
  namespace           = "AWS/SNS"
  period              = 3600
  statistic           = "Maximum"
  threshold           = var.sms_monthly_spend_limit * 0.8
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.system_alerts.arn]

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-sms-spend-high"
  })
}
