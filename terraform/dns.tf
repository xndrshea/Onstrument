# Certificate for HTTPS
resource "aws_acm_certificate" "main" {
  domain_name               = "onstrument.com"
  subject_alternative_names = ["*.onstrument.com"]
  validation_method         = "DNS"
}

# Route53 Zone
resource "aws_route53_zone" "main" {
  name = "onstrument.com"
}

# Certificate Validation
resource "aws_acm_certificate_validation" "main" {
  certificate_arn = aws_acm_certificate.main.arn
  depends_on      = [aws_route53_zone.main]
}

# DNS Records for Certificate Validation
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  name    = each.value.name
  type    = each.value.type
  zone_id = aws_route53_zone.main.zone_id
  records = [each.value.record]
  ttl     = 60
}

# Frontend DNS Records
resource "aws_route53_record" "frontend" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.environment == "prod" ? "www" : "staging"
  type    = "CNAME"
  ttl     = "300"
  records = [aws_cloudfront_distribution.frontend.domain_name]
}

# Email Records
resource "aws_route53_record" "google_mx" {
  zone_id = aws_route53_zone.main.zone_id
  name    = ""
  type    = "MX"
  ttl     = "300"
  records = ["1 SMTP.GOOGLE.COM."]
}

resource "aws_route53_record" "google_verify" {
  zone_id = aws_route53_zone.main.zone_id
  name    = ""
  type    = "TXT"
  ttl     = "300"
  records = ["google-site-verification=YEYUSOa_1blO_3jVlF3Y-v3dV67kSwTwjdJEqEBTDS8"]
}

resource "aws_route53_record" "spf" {
  zone_id = aws_route53_zone.main.zone_id
  name    = ""
  type    = "TXT"
  ttl     = "300"
  records = ["v=spf1 include:_spf.google.com ~all"]
}

resource "aws_route53_record" "dkim" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "google._domainkey"
  type    = "TXT"
  ttl     = "300"
  records = ["v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzqAO69mGokEqOFgp5x7a7ExjM0WMWuBPrT6DZkqb9bPXxTZGjQDWu3sYivKl7GJvjyn2V7da4EwLSJ17l5+ZK8Qlk9D3e0H3Rag3xFSr3FjPBhxrkoc1d+iANkKQVuQtceVu85ICWOA+uYfHkhTfFWkn9lVtsBk/2sS4uk1SfkVjaM5fu2ZR9e86HMb3nzFCKpJX+guVJILxP4jNJr0rDK8yY3/nLn0LMUtJ7kX/ETOALycBFT399GgjuP1YZkEAuGP30xIs3Hl6mXBsv8xzDL1EM1EmHmXGmuUW2MG8zXFMBBKiSVM2X27FwzDXuGddi5gZYS8KbLQ2m7OmvroJKwIDAQAB"]
}

# Root domain (onstrument.com)
resource "aws_route53_record" "root" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "" # Empty = root domain
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.frontend_prod.domain_name
    zone_id                = aws_cloudfront_distribution.frontend_prod.hosted_zone_id
    evaluate_target_health = false
  }
}

# WWW domain (www.onstrument.com)
resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "www"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.frontend_prod.domain_name
    zone_id                = aws_cloudfront_distribution.frontend_prod.hosted_zone_id
    evaluate_target_health = false
  }
}

# Staging Frontend (staging.onstrument.com)
resource "aws_route53_record" "staging" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "staging"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.frontend_staging.domain_name
    zone_id                = aws_cloudfront_distribution.frontend_staging.hosted_zone_id
    evaluate_target_health = false
  }
}

# Production API (api.onstrument.com)
resource "aws_route53_record" "api_prod" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api"
  type    = "A"
  alias {
    name                   = aws_lb.prod.dns_name
    zone_id                = aws_lb.prod.zone_id
    evaluate_target_health = true
  }
}

# Staging API (api.staging.onstrument.com)
resource "aws_route53_record" "api_staging" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.staging"
  type    = "A"
  alias {
    name                   = aws_lb.staging.dns_name
    zone_id                = aws_lb.staging.zone_id
    evaluate_target_health = true
  }
}
