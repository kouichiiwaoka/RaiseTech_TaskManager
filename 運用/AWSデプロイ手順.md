# AWSデプロイ手順

このプロジェクトをAWSへデプロイするための、認証の設定とTerraformの手順をまとめる。AWS・Terraform・IaCを初めて使う人を対象に、用語から説明する。Claude Codeが守るルールは[CLAUDE.md](../CLAUDE.md)の「AWSへのデプロイ」が正本。

## 1. 全体像

```text
Mac（作業する場所）
 ├─ AWS CLI   … AWSを操作するコマンド。ログインに使う
 ├─ Terraform … 「AWSに何を作るか」を書いたファイル（infra/terraform/）を読み、その通りに作る
 └─ Claude    … Terraformのファイルを書き、planの結果と費用を説明して、applyを実行する
        │ インターネット
        ▼
AWS（Amazonのクラウド）
 ├─ 画面（React）          → S3 + CloudFront（予定）
 ├─ サーバー（Spring Boot） → EC2 または ECS（予定）
 └─ DB（PostgreSQL）        → EC2上のDocker または RDS（予定）
```

## 2. 用語

### AWS

Amazonが貸し出しているサーバー・DB・ストレージなど。使った時間と量に応じて料金がかかる。**作ったまま放置すると、使っていなくても料金がかかり続ける**。

| 用語 | 意味 |
|---|---|
| リージョン | データセンターのある地域。このプロジェクトは `ap-northeast-1`（東京） |
| ルートユーザー | アカウント作成時のメールアドレスでログインする最上位のユーザー。何でもできるため、初期設定以外では使わない |
| IAM | 「誰が・何をしてよいか」を管理する仕組み |
| IAM Identity Center | 普段使うユーザーを作り、期限付きの鍵でログインさせる仕組み。このプロジェクトではこれを使う |
| アクセスキー | 期限のない鍵。漏れると第三者に使われ高額請求の原因になるため、このプロジェクトでは作らない |
| MFA | スマートフォンのアプリなどを使う二段階認証 |

### IaC（Infrastructure as Code）

サーバーやDBの構成を、管理画面のクリックではなく**ファイルに書いて管理する**考え方。

- 同じファイルから同じ環境を何度でも作れる（再現性）。
- Gitで「いつ・何を・なぜ変えたか」を追える（履歴）。
- 作る前にPRで差分を確認できる（レビュー）。
- 作った物をファイルで把握でき、`terraform destroy` でまとめて消せる（消し忘れ防止）。

### Terraform

IaCの代表的なツール。`.tf` ファイルに「欲しい状態」を書くと、今の状態との差を計算して、作成・変更・削除を行う。

| コマンド | 内容 | AWSへの影響 |
|---|---|---|
| `terraform init` | 準備（AWS用プラグインのダウンロード） | なし |
| `terraform fmt` / `validate` | 書式の整形 / 文法の確認 | なし |
| `terraform plan` | 何を作る・変える・消すかの計画を表示 | なし（参照のみ） |
| `terraform apply` | 計画を実行して実際に作る・変える | **あり。料金が発生する** |
| `terraform destroy` | Terraformで作った物をすべて消す | **あり。消したデータは戻らない** |

planの記号の読み方: `+` 作成、`~` 変更、`-` 削除、`-/+` 置き換え（いったん削除して作り直す。DBなら中身が消える）。

**state**: Terraformは自分が作った物を `terraform.tfstate` に記録する。中にパスワードなどが平文で入ることがあるため、**Gitにコミットしない・表示しない**（`.gitignore` で除外済み）。今はMac上に保存し、実際のリソースを作る段階でS3への保存に切り替える。

## 3. 認証の設定（初回のみ）

### 3-1. AWSアカウントの作成（ブラウザ）

1. AWSの公式サイトからアカウントを作成する（クレジットカードが必要）。
2. **ルートユーザーにMFAを設定する。**
3. **予算アラートを設定する（planより前に必須）。** 「Billing and Cost Management」→「Budgets」で、例えば月1,000円を超える見込みになったらメールが届くようにする。
4. 無料枠の条件は変更されることがあるため、作成時に公式ページで確認する。

### 3-2. 普段使うユーザーの作成（ブラウザ）

1. 「IAM Identity Center」を有効にする（リージョンは東京）。
2. ユーザーを1人作成し、AWSアカウントに許可セットを割り当てる。学習中は `AdministratorAccess`、慣れたら必要な権限に絞る。
3. 届いた招待メールから、パスワードとMFAを設定する。
4. Identity Centerの画面に表示される「AWS access portal URL」（`https://xxxx.awsapps.com/start` の形）を控える。

以降はブラウザの管理画面を使わず、コマンドで操作する。

### 3-3. ツールのインストール（ターミナル）

```sh
brew install awscli
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
aws --version
terraform -version
```

### 3-4. AWS CLIのログイン設定（ターミナル）

```sh
aws configure sso
```

| 質問 | 入力する値 |
|---|---|
| SSO session name | `taskmanager` |
| SSO start URL | 3-2で控えたURL |
| SSO region | `ap-northeast-1` |
| SSO registration scopes | そのままEnter |
| （ブラウザが開く） | 承認する |
| CLI default client Region | `ap-northeast-1` |
| CLI default output format | `json` |
| Profile name | `taskmanager` |

設定は `~/.aws/config` に、ログイン中の一時的な鍵は `~/.aws/sso/cache/` に保存される。**これらのファイルの中身をClaudeに読ませたり、チャットに貼ったりしない**（Claude Codeの設定で読み取りを禁止している）。

## 4. 毎回の作業

```sh
aws sso login --profile taskmanager                  # ブラウザで承認する。数時間で期限が切れる
aws sts get-caller-identity --profile taskmanager    # ログイン先のアカウントIDを確認する
cd infra/terraform
terraform init       # 初回とプラグイン更新時
terraform plan       # 計画を確認する
terraform apply      # 作る（Claudeが実行する場合はplanの内容と費用を先に報告する）
terraform destroy    # 使い終わったら消す
```

ひな形（`infra/terraform/`）は、ログイン中のアカウントIDとリージョンを読み取るだけで、リソースは作らない。`terraform plan` の結果に `account_id` が表示され、作成予定のリソースが0件なら、ログインとTerraformの接続設定は完了。

ログインの期限が切れると `Token has expired` などのエラーになる。`aws sso login --profile taskmanager` をやり直す。

## 5. 構成の段階と費用の注意

| 段階 | 構成 | 特徴 |
|---|---|---|
| ステップ1（学習向け） | EC2を1台作り、DB・バックエンド・画面をそこで動かす | 構成が単純で安い。OSの更新などは自分で行う |
| ステップ2（本格的） | 画面: S3 + CloudFront ／ サーバー: ECS Fargate ／ DB: RDS | 実務でよく使われる構成。ALB・RDS・NAT Gatewayは使っていなくても毎月料金がかかる |

- 作業を終えたら `terraform destroy` で消す習慣をつける。消したデータと発生した料金は戻らない。
- Terraformで作った物には `ManagedBy = terraform` のタグが付く。タグのない物はTerraform以外で作られた物なので、Terraformでは消さない。
- `*.tfvars` にパスワードやキーを書かない。
