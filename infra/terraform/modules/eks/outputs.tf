output "cluster_id" {
  value       = aws_eks_cluster.this.id
  description = "EKS cluster ID"
}

output "cluster_endpoint" {
  value       = aws_eks_cluster.this.endpoint
  description = "EKS cluster API server endpoint"
}

output "cluster_certificate_authority" {
  value       = aws_eks_cluster.this.certificate_authority[0].data
  description = "Base64-encoded certificate data for cluster authentication"
}

output "cluster_oidc_issuer_url" {
  value       = aws_eks_cluster.this.identity[0].oidc[0].issuer
  description = "OIDC issuer URL for IRSA"
}

output "node_role_arn" {
  value       = aws_iam_role.node.arn
  description = "IAM role ARN for EKS worker nodes"
}

output "node_security_group_id" {
  value       = aws_security_group.node.id
  description = "Security group ID for EKS worker nodes"
}
