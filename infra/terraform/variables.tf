variable "region" {
  description = "AWS のリージョン（東京）"
  type        = string
  default     = "ap-northeast-1"
}

variable "profile" {
  description = "aws configure sso で作成したプロファイル名"
  type        = string
  default     = "taskmanager"
}

variable "project" {
  description = "リソースの名前とタグに使うプロジェクト名"
  type        = string
  default     = "raisetech-taskmanager"
}
