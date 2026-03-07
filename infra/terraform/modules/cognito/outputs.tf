output "providers_user_pool_id" {
  description = "Cognito user pool ID for healthcare providers"
  value       = aws_cognito_user_pool.providers.id
}

output "providers_user_pool_arn" {
  description = "Cognito user pool ARN for healthcare providers"
  value       = aws_cognito_user_pool.providers.arn
}

output "providers_client_id" {
  description = "Cognito app client ID for providers pool"
  value       = aws_cognito_user_pool_client.providers.id
}

output "patients_user_pool_id" {
  description = "Cognito user pool ID for patients"
  value       = aws_cognito_user_pool.patients.id
}

output "patients_user_pool_arn" {
  description = "Cognito user pool ARN for patients"
  value       = aws_cognito_user_pool.patients.arn
}

output "patients_client_id" {
  description = "Cognito app client ID for patients pool"
  value       = aws_cognito_user_pool_client.patients.id
}

output "providers_user_pool_domain" {
  description = "Cognito user pool domain for providers hosted UI"
  value       = aws_cognito_user_pool_domain.providers.domain
}

output "patients_user_pool_domain" {
  description = "Cognito user pool domain for patients hosted UI"
  value       = aws_cognito_user_pool_domain.patients.domain
}
