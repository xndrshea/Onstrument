# Frontend outputs
output "frontend_bucket_name" {
  description = "Name of the S3 bucket hosting frontend"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  description = "ID of CloudFront distribution"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "Domain name of CloudFront distribution"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "cloudfront_url" {
  description = "URL of CloudFront distribution (https://)"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

# Backend outputs
output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.backend.name
}

output "alb_dns_name" {
  description = "DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}

output "backend_url" {
  description = "URL of the backend service"
  value       = "https://${aws_lb.main.dns_name}"
}

# DNS outputs
output "nameservers" {
  description = "Nameservers for Namecheap configuration"
  value       = aws_route53_zone.main.name_servers
}
