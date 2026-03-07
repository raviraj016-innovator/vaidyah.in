output "db_endpoint" {
  value       = aws_db_instance.this.endpoint
  description = "RDS instance endpoint"
}

output "db_port" {
  value       = aws_db_instance.this.port
  description = "RDS instance port"
}

output "db_name" {
  value       = aws_db_instance.this.db_name
  description = "Name of the default database"
}

output "db_instance_id" {
  value       = aws_db_instance.this.id
  description = "RDS instance identifier"
}

output "db_secret_arn" {
  value       = aws_secretsmanager_secret.db_password.arn
  description = "Secrets Manager ARN containing the database password"
}
