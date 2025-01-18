variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "onstrument"
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "onstrument.com"
}

variable "backend_image_tag" {
  description = "Docker image tag for backend service"
  type        = string
  default     = "latest" # Just needs a placeholder for infrastructure setup
}

variable "frontend_version" {
  description = "Version tag for frontend deployment"
  type        = string
  default     = "latest" # Allow it to be empty for plan/init
}

variable "create_certificate_validation" {
  description = "Whether to create certificate validation resources"
  type        = bool
  default     = false # Set to false since validation is already done
}
