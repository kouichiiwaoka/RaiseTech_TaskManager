provider "aws" {
  region  = var.region
  profile = var.profile

  # すべてのリソースに付くタグ。どのプロジェクトの物か、Terraformで作った物かを判別する
  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}
