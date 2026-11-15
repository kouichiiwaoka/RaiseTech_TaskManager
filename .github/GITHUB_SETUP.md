# GitHub側の保護設定

GitHub側の設定はリポジトリのファイルとは別に管理される。実際の設定は画面またはAPIで確認する。

GitHub CLIを利用する場合はユーザー自身で `gh auth login -h github.com` を完了する。認証情報をチャットやファイルに転記しない。

## mainの保護
対象: `kouichiiwaoka/RaiseTech_TaskManager` の `main`。
既存のrulesetとbranch protectionを先に確認し、既存の厳しい条件を弱めない。
Settings → Branches → Add branch protection ruleで、以下を設定する。既存のmain用ルールがあればそれを更新する。

- Branch name pattern: `main`
- Require a pull request before merging: 有効
- Require approvals: 新規の必須条件にはしない（個人開発で自己承認できず停止するのを防ぐ）。既存条件があれば勝手に解除しない。
- Require conversation resolution before merging: 有効
- Do not allow bypassing the above settings: 有効（管理者にも適用）
- Allow force pushes: 無効
- Allow deletions: 無効
- 必須status check: 実在し成功を確認したチェックのみ指定する。現時点では新しいActionsを追加・実行しない。料金が不明な呼び出しを避けるため、将来のCI導入時に利用条件を確認する。

保存後に画面またはAPIで再取得し、mainへのPR必須と管理者適用、force push・削除禁止を確認する。確認のためにmainへのpushやforce pushは試さない。
プランや権限で保存できない場合は課金・アップグレードせず報告する。

## 適用範囲
mainへの直接pushはGitHubの保護で制限する。Issue起点、ブランチ命名、PRのIssue関連付けはAGENTS.mdでCodexに義務付ける。
テンプレートだけではAPI経由のIssue作成やPRのIssue関連付けをGitHub側で強制できない。これらのサーバー側自動検査は未導入。
