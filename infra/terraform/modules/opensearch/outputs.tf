output "domain_endpoint" {
  description = "OpenSearch domain endpoint"
  value       = aws_opensearch_domain.this.endpoint
}

output "domain_arn" {
  description = "OpenSearch domain ARN"
  value       = aws_opensearch_domain.this.arn
}

output "domain_id" {
  description = "OpenSearch domain ID"
  value       = aws_opensearch_domain.this.domain_id
}
