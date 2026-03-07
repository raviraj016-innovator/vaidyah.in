output "voice_bucket_name" {
  description = "Name of the voice recordings S3 bucket"
  value       = aws_s3_bucket.voice.id
}

output "voice_bucket_arn" {
  description = "ARN of the voice recordings S3 bucket"
  value       = aws_s3_bucket.voice.arn
}

output "documents_bucket_name" {
  description = "Name of the clinical documents S3 bucket"
  value       = aws_s3_bucket.documents.id
}

output "documents_bucket_arn" {
  description = "ARN of the clinical documents S3 bucket"
  value       = aws_s3_bucket.documents.arn
}

output "images_bucket_name" {
  description = "Name of the medical images S3 bucket"
  value       = aws_s3_bucket.images.id
}

output "images_bucket_arn" {
  description = "ARN of the medical images S3 bucket"
  value       = aws_s3_bucket.images.arn
}
