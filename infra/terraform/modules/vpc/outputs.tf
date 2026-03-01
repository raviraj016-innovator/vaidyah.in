###############################################################################
# Vaidyah Healthcare Platform - VPC Module Outputs
###############################################################################

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = aws_subnet.private[*].id
}

output "alb_security_group_id" {
  description = "Security group ID for ALB tier"
  value       = aws_security_group.alb.id
}

output "app_security_group_id" {
  description = "Security group ID for application tier"
  value       = aws_security_group.app.id
}

output "database_security_group_id" {
  description = "Security group ID for database tier"
  value       = aws_security_group.database.id
}

output "nat_gateway_ip" {
  description = "Public IP of the NAT gateway"
  value       = var.enable_nat_gateway ? aws_eip.nat[0].public_ip : null
}
