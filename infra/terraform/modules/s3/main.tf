locals {
  voice_bucket_name     = "${var.project_name}-${var.environment}-voice-recordings"
  documents_bucket_name = "${var.project_name}-${var.environment}-documents"
  images_bucket_name    = "${var.project_name}-${var.environment}-medical-images"
  logging_bucket_name   = var.logging_bucket_name != "" ? var.logging_bucket_name : "${var.project_name}-${var.environment}-s3-access-logs"
}

###############################################################################
# S3 Access Logging Bucket
###############################################################################

resource "aws_s3_bucket" "logging" {
  count         = var.logging_bucket_name == "" ? 1 : 0
  bucket        = local.logging_bucket_name
  force_destroy = false

  tags = merge(var.tags, {
    Name = local.logging_bucket_name
  })
}

resource "aws_s3_bucket_public_access_block" "logging" {
  count  = var.logging_bucket_name == "" ? 1 : 0
  bucket = aws_s3_bucket.logging[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logging" {
  count  = var.logging_bucket_name == "" ? 1 : 0
  bucket = aws_s3_bucket.logging[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logging" {
  count  = var.logging_bucket_name == "" ? 1 : 0
  bucket = aws_s3_bucket.logging[0].id

  rule {
    id     = "log-retention"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

resource "aws_s3_bucket_policy" "logging_tls" {
  count  = var.logging_bucket_name == "" ? 1 : 0
  bucket = aws_s3_bucket.logging[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.logging[0].arn,
          "${aws_s3_bucket.logging[0].arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

###############################################################################
# Voice Recordings Bucket
###############################################################################

resource "aws_s3_bucket" "voice" {
  bucket        = local.voice_bucket_name
  force_destroy = false

  tags = var.tags
}

resource "aws_s3_bucket_versioning" "voice" {
  bucket = aws_s3_bucket.voice.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "voice" {
  bucket = aws_s3_bucket.voice.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "voice" {
  bucket = aws_s3_bucket.voice.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "voice" {
  bucket = aws_s3_bucket.voice.id

  rule {
    id     = "voice-tiering"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "voice" {
  bucket = aws_s3_bucket.voice.id

  cors_rule {
    allowed_headers = ["Content-Type", "Authorization", "x-amz-content-sha256", "x-amz-date"]
    allowed_methods = ["PUT", "POST"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_policy" "voice_tls" {
  bucket = aws_s3_bucket.voice.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.voice.arn,
          "${aws_s3_bucket.voice.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_logging" "voice" {
  bucket = aws_s3_bucket.voice.id

  target_bucket = var.logging_bucket_name != "" ? var.logging_bucket_name : aws_s3_bucket.logging[0].id
  target_prefix = "voice-recordings/"
}

###############################################################################
# Clinical Documents Bucket
###############################################################################

resource "aws_s3_bucket" "documents" {
  bucket        = local.documents_bucket_name
  force_destroy = false

  tags = var.tags
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "documents-tiering"
    status = "Enabled"

    transition {
      days          = 60
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 180
      storage_class = "GLACIER"
    }
  }
}

resource "aws_s3_bucket_policy" "documents_tls" {
  bucket = aws_s3_bucket.documents.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.documents.arn,
          "${aws_s3_bucket.documents.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_logging" "documents" {
  bucket = aws_s3_bucket.documents.id

  target_bucket = var.logging_bucket_name != "" ? var.logging_bucket_name : aws_s3_bucket.logging[0].id
  target_prefix = "documents/"
}

###############################################################################
# Medical Images Bucket
###############################################################################

resource "aws_s3_bucket" "images" {
  bucket        = local.images_bucket_name
  force_destroy = false

  tags = var.tags
}

resource "aws_s3_bucket_versioning" "images" {
  bucket = aws_s3_bucket.images.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "images" {
  bucket = aws_s3_bucket.images.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    id     = "images-tiering"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
  }
}

resource "aws_s3_bucket_logging" "images" {
  bucket = aws_s3_bucket.images.id

  target_bucket = var.logging_bucket_name != "" ? var.logging_bucket_name : aws_s3_bucket.logging[0].id
  target_prefix = "medical-images/"
}

resource "aws_s3_bucket_policy" "images_tls" {
  bucket = aws_s3_bucket.images.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.images.arn,
          "${aws_s3_bucket.images.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}
