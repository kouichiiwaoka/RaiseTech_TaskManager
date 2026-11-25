# ログイン中のアカウントを読み取るだけ（data は参照のみで、リソースを作らず料金もかからない）。
# terraform plan が成功すれば、AWS CLI のログインと Terraform の接続設定ができていることを確認できる。
data "aws_caller_identity" "current" {}

data "aws_region" "current" {}
