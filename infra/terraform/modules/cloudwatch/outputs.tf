###############################################################################
# Vaidyah Healthcare Platform - CloudWatch Module Outputs
###############################################################################

output "service_log_group_names" {
  description = "Map of service names to CloudWatch log group names"
  value       = { for k, v in aws_cloudwatch_log_group.services : k => v.name }
}

output "service_log_group_arns" {
  description = "Map of service names to CloudWatch log group ARNs"
  value       = { for k, v in aws_cloudwatch_log_group.services : k => v.arn }
}

output "application_log_group_name" {
  description = "CloudWatch log group name for application logs"
  value       = aws_cloudwatch_log_group.application.name
}

output "application_log_group_arn" {
  description = "CloudWatch log group ARN for application logs"
  value       = aws_cloudwatch_log_group.application.arn
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "alarm_arns" {
  description = "Map of alarm names to ARNs"
  value = merge(
    { for k, v in aws_cloudwatch_metric_alarm.high_error_rate : "error-rate-${k}" => v.arn },
    { for k, v in aws_cloudwatch_metric_alarm.high_latency : "latency-${k}" => v.arn },
    {
      "emergency-alerts" = aws_cloudwatch_metric_alarm.emergency_alerts.arn
      "circuit-breaker"  = aws_cloudwatch_metric_alarm.circuit_breaker.arn
    }
  )
}

output "metric_namespace" {
  description = "Custom CloudWatch metric namespace"
  value       = "Vaidyah"
}
