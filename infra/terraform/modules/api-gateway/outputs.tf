###############################################################################
# Vaidyah Healthcare Platform - API Gateway Module Outputs
###############################################################################

output "api_id" {
  description = "ID of the HTTP API"
  value       = aws_apigatewayv2_api.this.id
}

output "api_endpoint" {
  description = "Default endpoint URL of the HTTP API"
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "stage_invoke_urls" {
  description = "Map of stage name to invoke URL"
  value = {
    for stage_name in var.stage_names :
    stage_name => "${aws_apigatewayv2_api.this.api_endpoint}/${stage_name}"
  }
}

output "custom_domain_url" {
  description = "Custom domain URL for the API (null if not configured)"
  value       = local.custom_domain ? "https://api.${var.domain_name}" : null
}

output "waf_acl_arn" {
  description = "ARN of the WAF WebACL protecting the API"
  value       = aws_wafv2_web_acl.this.arn
}

output "vpc_link_id" {
  description = "ID of the VPC Link (null if not configured)"
  value       = local.vpc_link_enabled ? aws_apigatewayv2_vpc_link.this[0].id : null
}

output "authorizer_id" {
  description = "ID of the Cognito JWT authorizer"
  value       = aws_apigatewayv2_authorizer.cognito.id
}
