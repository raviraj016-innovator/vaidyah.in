output "sessions_table_name" {
  description = "Name of the sessions DynamoDB table"
  value       = aws_dynamodb_table.sessions.name
}

output "sessions_table_arn" {
  description = "ARN of the sessions DynamoDB table"
  value       = aws_dynamodb_table.sessions.arn
}

output "voice_chunks_table_name" {
  description = "Name of the voice chunks DynamoDB table"
  value       = aws_dynamodb_table.voice_chunks.name
}

output "voice_chunks_table_arn" {
  description = "ARN of the voice chunks DynamoDB table"
  value       = aws_dynamodb_table.voice_chunks.arn
}
