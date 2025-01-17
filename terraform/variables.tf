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
