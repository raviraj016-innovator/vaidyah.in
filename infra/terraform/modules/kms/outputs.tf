###############################################################################
# Vaidyah Healthcare Platform - KMS Module Outputs
###############################################################################

output "phi_key_arn" {
  description = "ARN of the PHI encryption KMS key"
  value       = aws_kms_key.phi.arn
}

output "phi_key_id" {
  description = "ID of the PHI encryption KMS key"
  value       = aws_kms_key.phi.key_id
}

output "phi_key_alias_arn" {
  description = "ARN of the PHI key alias"
  value       = aws_kms_alias.phi.arn
}

output "phi_key_alias_name" {
  description = "Name of the PHI key alias"
  value       = aws_kms_alias.phi.name
}
