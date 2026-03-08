###############################################################################
# Vaidyah Healthcare Platform - SNS Module Outputs
###############################################################################

output "emergency_alerts_topic_arn" {
  description = "ARN of the emergency alerts SNS topic"
  value       = aws_sns_topic.emergency_alerts.arn
}

output "consultation_updates_topic_arn" {
  description = "ARN of the consultation updates SNS topic"
  value       = aws_sns_topic.consultation_updates.arn
}

output "trial_matches_topic_arn" {
  description = "ARN of the trial matches SNS topic"
  value       = aws_sns_topic.trial_matches.arn
}

output "system_alerts_topic_arn" {
  description = "ARN of the system alerts SNS topic"
  value       = aws_sns_topic.system_alerts.arn
}

output "patient_reminders_topic_arn" {
  description = "ARN of the patient reminders SNS topic"
  value       = aws_sns_topic.patient_reminders.arn
}

output "wearable_alerts_topic_arn" {
  description = "ARN of the wearable alerts SNS topic"
  value       = aws_sns_topic.wearable_alerts.arn
}

output "all_topic_arns" {
  description = "Map of all SNS topic names to ARNs"
  value = {
    emergency_alerts     = aws_sns_topic.emergency_alerts.arn
    consultation_updates = aws_sns_topic.consultation_updates.arn
    trial_matches        = aws_sns_topic.trial_matches.arn
    system_alerts        = aws_sns_topic.system_alerts.arn
    patient_reminders    = aws_sns_topic.patient_reminders.arn
    wearable_alerts      = aws_sns_topic.wearable_alerts.arn
  }
}

output "apns_platform_application_arn" {
  description = "ARN of the iOS APNS platform application (null if not configured)"
  value       = length(aws_sns_platform_application.apns) > 0 ? aws_sns_platform_application.apns[0].arn : null
}

output "gcm_platform_application_arn" {
  description = "ARN of the Android GCM/FCM platform application (null if not configured)"
  value       = length(aws_sns_platform_application.gcm) > 0 ? aws_sns_platform_application.gcm[0].arn : null
}

output "sns_delivery_status_role_arn" {
  description = "ARN of the IAM role for SNS delivery status logging"
  value       = aws_iam_role.sns_delivery_status.arn
}
