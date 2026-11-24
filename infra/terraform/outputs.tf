output "account_id" {
  description = "接続先の AWS アカウントID（想定したアカウントか確認する）"
  value       = data.aws_caller_identity.current.account_id
}

output "region" {
  description = "接続先のリージョン"
  value       = data.aws_region.current.region
}
