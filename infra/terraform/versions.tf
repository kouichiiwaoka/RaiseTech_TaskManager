terraform {
  # 最新安定版 1.17.2（2026-11-23 確認）。~> 1.17.2 は 1.17.2 以上 1.18 未満（バグ修正版だけ受け入れる）
  required_version = "~> 1.17.2"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # 最新安定版 6.73.0（2026-11-23 確認）。~> 6.73 は 6.73 以上 7.0 未満。実際の版は .terraform.lock.hcl で固定する
      version = "~> 6.73"
    }
  }

  # state はまだローカル（terraform.tfstate、Git管理外）に保存する。
  # 実際のリソースを作る段階で、S3 への保存（backend "s3"）に切り替える。
}
