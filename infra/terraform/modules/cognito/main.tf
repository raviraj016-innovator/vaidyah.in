###############################################################################
# Providers User Pool (Nurses, Doctors, Admins)
###############################################################################

resource "aws_cognito_user_pool" "providers" {
  name = "${var.project_name}-${var.environment}-providers"

  mfa_configuration = "ON"

  software_token_mfa_configuration {
    enabled = true
  }

  password_policy {
    minimum_length                   = 12
    require_uppercase                = true
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 1
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    name                     = "role"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 64
    }
  }

  schema {
    name                     = "center_id"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 128
    }
  }

  schema {
    name                     = "registration_number"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 128
    }
  }

  auto_verified_attributes = ["email"]

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  lambda_config {}

  tags = var.tags
}

resource "aws_cognito_user_pool_client" "providers" {
  name         = "${var.project_name}-${var.environment}-providers-client"
  user_pool_id = aws_cognito_user_pool.providers.id

  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 7

  prevent_user_existence_errors = "ENABLED"
}

###############################################################################
# Patients User Pool
###############################################################################

resource "aws_cognito_user_pool" "patients" {
  name = "${var.project_name}-${var.environment}-patients"

  mfa_configuration = "ON"

  software_token_mfa_configuration {
    enabled = true
  }

  password_policy {
    minimum_length                   = 12
    require_uppercase                = true
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 1
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_phone_number"
      priority = 1
    }
  }

  schema {
    name                     = "phone_number"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 32
    }
  }

  schema {
    name                     = "abdm_id"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 128
    }
  }

  schema {
    name                     = "language_preference"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 16
    }
  }

  auto_verified_attributes = ["phone_number"]

  tags = var.tags
}

resource "aws_cognito_user_pool_client" "patients" {
  name         = "${var.project_name}-${var.environment}-patients-client"
  user_pool_id = aws_cognito_user_pool.patients.id

  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "phone", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 7

  prevent_user_existence_errors = "ENABLED"
}

###############################################################################
# User Pool Domain (Hosted UI)
###############################################################################

resource "aws_cognito_user_pool_domain" "providers" {
  domain       = "${var.project_name}-${var.environment}-providers"
  user_pool_id = aws_cognito_user_pool.providers.id
}

resource "aws_cognito_user_pool_domain" "patients" {
  domain       = "${var.project_name}-${var.environment}-patients"
  user_pool_id = aws_cognito_user_pool.patients.id
}
