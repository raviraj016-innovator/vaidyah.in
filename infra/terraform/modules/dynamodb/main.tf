resource "aws_dynamodb_table" "sessions" {
  name                        = "${var.project_name}-${var.environment}-sessions"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "session_id"
  range_key                   = "timestamp"
  deletion_protection_enabled = var.environment == "prod" ? true : false

  attribute {
    name = "session_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "N"
  }

  attribute {
    name = "patient_id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  global_secondary_index {
    name            = "patient-sessions-index"
    hash_key        = "patient_id"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = var.tags
}

resource "aws_dynamodb_table" "voice_chunks" {
  name                        = "${var.project_name}-${var.environment}-voice-chunks"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "session_id"
  range_key                   = "chunk_index"
  deletion_protection_enabled = var.environment == "prod" ? true : false

  attribute {
    name = "session_id"
    type = "S"
  }

  attribute {
    name = "chunk_index"
    type = "N"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = var.tags
}
