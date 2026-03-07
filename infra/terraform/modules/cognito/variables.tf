variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "callback_urls" {
  description = "Allowed callback URLs for Cognito OAuth"
  type        = list(string)
  default     = ["http://localhost:3000/callback"]

  validation {
    condition     = alltrue([for url in var.callback_urls : can(regex("^https?://", url))])
    error_message = "All callback_urls must be valid HTTP(S) URLs."
  }
}

variable "logout_urls" {
  description = "Allowed logout URLs for Cognito OAuth"
  type        = list(string)
  default     = ["http://localhost:3000/logout"]

  validation {
    condition     = alltrue([for url in var.logout_urls : can(regex("^https?://", url))])
    error_message = "All logout_urls must be valid HTTP(S) URLs."
  }
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
