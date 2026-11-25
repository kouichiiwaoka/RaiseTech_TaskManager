# Task Manager バックエンド

Java 25 / Spring Boot 4.1.2 / Gradle 9.8.2。バックエンドはホストで、PostgreSQL 17はDocker Composeで動かします。Docker DesktopなどのDockerエンジンを起動しておいてください。

## 1. PostgreSQLを起動

リポジトリのルートで実行します。

```sh
sh scripts/setup-local-db.sh
DB_PORT=5432 docker compose up -d --wait
docker compose ps
```

セットアップはランダムなパスワードをGit対象外の `.env` に保存します。既存の `.env` は上書きしません。認証情報を含むため `.env` や `docker compose config` の出力を共有しないでください。

DB名・ユーザー名は `taskmanager`、接続先は `127.0.0.1:5432` に固定します。競合時は別ポートへ変更せず、起動元を確認して競合する他プロジェクトのローカルサービスを通常停止します。同じプロジェクトの正常なサービスは再利用します。起動全体の手順は[統一起動スキル](../.claude/skills/start-frontend-backend/SKILL.md)を参照してください。

## 2. バックエンドを起動

```sh
cd backend
export JAVA_HOME="$PWD/.local/jdk-25.0.5+8/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
DB_HOST=127.0.0.1 DB_PORT=5432 SERVER_PORT=8080 GRADLE_USER_HOME=/private/tmp/taskmanager-gradle ./gradlew bootRun --args='--server.address=127.0.0.1 --server.port=8080'
```

この端末では上記パスにJDKを配置済みです。別端末ではJDK 25を別途用意してください。初回ビルドは公開依存関係を取得します。バックエンドは `backend/` またはリポジトリルートを作業ディレクトリとして起動すると `.env` を読み込みます。

別ターミナルから確認します。

```sh
curl --fail http://127.0.0.1:8080/actuator/health
```

`{"status":"UP"}` はDB接続を含めた正常応答です。DBが起動していない場合、バックエンドの起動は失敗します。終了はバックエンドのターミナルで Control + C を押します。

## 3. 読み書きテスト

DBを起動した状態で、上記のJava設定を行ったターミナルで実行します。

```sh
GRADLE_USER_HOME=/private/tmp/taskmanager-gradle ./gradlew test bootJar
```

実PostgreSQLを使用して、HTTPヘルスチェックとバックエンドのJdbcTemplate経由のタスク保存・取得・初期値を検証します。JdbcTemplate経由のテストの挿入はトランザクションのロールバックで残りません。後述のHTTP統合テストは別途テスト行を投入し、終了後にその行だけを除去します。H2への置換は行いません。


## スキーマ管理と実装範囲

Spring Data JPA / Hibernate、PostgreSQL JDBCドライバー、Flywayを導入済みです。[Spring Bootの公式手順](https://docs.spring.io/spring-boot/how-to/data-initialization.html)に従い、起動時に `src/main/resources/db/migration` のSQLを適用します。HibernateのDDL自動作成は無効で、`validate` を指定しています。

V1では `tasks` テーブルを作成します。IDはUUID、タイトルは255文字以内かつ空白のみを禁止。優先度は `high / medium / low`（初期値 `medium`）、状態は `todo / doing / done`（初期値 `todo`）、期限はDATE、並び順は0以上です。適用済みSQLは変更せず、次のバージョンのSQLを追加してください。

タスクのJPAエンティティとREAD APIを実装済みです。実アプリのフロントエンドとの検索・閲覧連携も実装済みです。POSTによる新規登録も実装済みです。更新・移動APIも実装済みです。物理削除APIも実装済みです。V2で削除確認設定のapp_settingテーブルを追加済みです。列ソート設定の永続化は行いません。`prototype/`は独立した画面確認用デモで、APIとは接続しません。

## 停止と永続化

ルートで `docker compose stop` を実行するとDBを停止します。再開は `DB_PORT=5432 docker compose up -d --wait` です。データは名前付きボリューム `postgres_data` に保存され、コンテナ再作成後も保持されます。ボリューム削除は行わないでください。

PostgreSQLの初期ユーザー・パスワード・DB名は初回のボリューム初期化時だけ反映されます。既存ボリュームに対して `.env` の認証設定だけ変更してもDB側は変更されません。

## 4. タスクREAD API

処理は `TaskController → TaskService → TaskRepository → PostgreSQL` の3層構造です。ControllerはHTTP入力・ステータスの検証・404応答、Serviceは検索語の整形・一覧と詳細の取得・レスポンスへの変換、RepositoryはDBアクセスを担当します。読み取り専用トランザクションはServiceで管理します。

デモデータが必要な場合のみ、起動後にリポジトリルートでローカル専用の架空データ4件を投入できます。Flywayの対象外なので通常起動時には投入されません。再実行しても同じIDは追加・上書きせず、既存データを保持します。

```sh
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backend/src/main/resources/db/local/seed-tasks.sql
curl --fail-with-body http://127.0.0.1:8080/api/tasks
curl --fail-with-body --get http://127.0.0.1:8080/api/tasks --data-urlencode 'status=doing' --data-urlencode 'q=API'
curl --fail-with-body http://127.0.0.1:8080/api/tasks/00000000-0000-4000-8000-000000000001
```

| GETパス | 動作 |
|---|---|
| `/api/tasks` | 全タスクをJSON配列で取得 |
| `/api/tasks?status=doing&q=API` | ステータスとタイトルの部分一致で検索。条件はAND |
| `/api/tasks/{id}` | UUID指定で1件のJSONオブジェクトを取得 |

`status` は省略可能で `todo / doing / done` のいずれかです。不正値・空文字は400です。`q` は省略・空白のみで全件、前後の空白を除去し、大文字小文字を区別しません。`%` と `_` も通常の文字として検索します。説明文は検索対象外です。

一覧の順序は `todo → doing → done`、同じ列では `sortOrder` 昇順、同順位ではUUID昇順です。該当なしは200と `[]`、存在しないUUIDは404、不正なUUID形式は400です。

レスポンスは `id / title / description / priority / dueDate / status / sortOrder` を返します。期限は `YYYY-MM-DD`、未設定の説明・期限は `null` です。一覧はページ分割せず、単一利用者の小規模ボード向けです。一覧API自体は画面を返しません。新規登録APIは次節に記載します。

HTTP統合テストでは実PostgreSQLにランダムUUIDのテスト行を投入し、一覧順序・検索・全項目・null・400・404を実通信で検証します。終了後はそのテストが投入した行だけを除去し、既存データを保持します。実行は上記の `test bootJar` と同じです。この環境の既存Gradleキャッシュは `/private/tmp/taskmanager-gradle` です。別端末では `GRADLE_USER_HOME` の指定は不要です。


上記の8081による検証記録は過去の実績です。現在の起動ルールではバックエンドは8080に固定し、競合回避に別ポートを使用しません。

画面からこのAPIへ検索条件が渡る流れと、Controller・Service・Repository・DBの役割は[学習メモ](../学習メモ.md)を参照してください。カード選択時の詳細表示は取得済み一覧データを使用し、上記の詳細取得APIは現在の画面からは呼びません。

## 5. タスクの新規登録API

`POST /api/tasks` に `Content-Type: application/json` を指定し、`title / description / priority / dueDate` を送信します。成功時は201 Created、Locationに詳細APIのパス、本文に登録済みのTaskResponseを返します。

```json
{"title":"架空の新規タスク","description":null,"priority":"medium","dueDate":null}
```

タイトルは前後空白を除き1〜255文字、priorityは省略・nullでmedium、指定する場合high / medium / lowです。descriptionとdueDateは任意で、期限はYYYY-MM-DDです。不正な入力は400です。IDはサーバーでUUIDを生成し、statusはtodo、sortOrderは未着手の最大値+1（空列なら0）とします。採番と保存を同一トランザクションで行い、PostgreSQLのトランザクション用アドバイザリロックで同時登録を直列化します。整数の採番上限に達した場合は409です。

再読み込み時は既存GET APIで永続化されたデータを取得します。優先度・期限の画面内ソート条件は保存しません。

## タスクの編集・移動

カードの詳細から「編集する」でタイトル・説明・優先度・期限を変更できます。PUT /api/tasks/{id}で保存し、成功時は更新した詳細へ戻ります。キャンセル・閉じる・Escapeは変更を保存せず詳細へ戻り、保存失敗時は入力を保持します。編集で進捗・順序は変更しません。

全件表示のボードでは、カードを他の列やカードの上半分・下半分にドラッグして進捗と列内順序を保存できます。PATCH /api/tasks/{id}/positionへstatusとbeforeId（末尾ならnull）を送ります。移動成功後だけボードを再取得し、移動元・移動先の画面内ソートを解除します。失敗時は元の表示・ソートを維持します。検索による絞り込み中は、非表示タスクとの誤った順序変更を避けるためドラッグを無効にします。検索条件をクリアすると移動できます。

再読み込みで編集内容・進捗・手動順序を復元します。優先度・期限のソート条件の永続化は不要と決定し、実装しません。

### 更新・移動APIのレスポンス

PUT /api/tasks/{id}はtitle / description / priority / dueDateの全項目を置き換えます。titleとpriorityは必須、説明・期限は省略・nullでクリアします。PATCH /api/tasks/{id}/positionはstatusとbeforeIdを受け、beforeIdのカード直前（nullなら列末尾）へ移動します。どちらも200と更新したTaskResponseを返します。不正な入力は400、対象タスクなしは404、移動先のカードが対象列に存在しない場合は409です。進捗・順序更新も登録と共通のトランザクションロックを使い、採番競合を防ぎます。

## 文書更新・テストの進め方

文書の作成・編集前は[文書運用ルール](../運用/文書運用ルール.md)と[edit-project-docs](../.claude/skills/edit-project-docs/SKILL.md)、テスト実行前は[テスト運用ルール](../運用/テスト運用ルール.md)と[plan-and-run-tests](../.claude/skills/plan-and-run-tests/SKILL.md)に従います。結果・未確認事項・省略理由は対応するIssue・PRに記録します。

## 現在の更新処理の制約

登録・編集・移動・削除は共通ロックで直列化します。同じタスクの同時編集をバージョンで検出する仕組みはなく、後から適用された編集が上書きします。移動時は対象列の他タスクの順序番号も振り直します。設計上の理由と見直す条件は[技術構成書 第7章](../技術構成書.md#7-現在の実装上の制約と見直す条件)を参照してください。

実DBテストはローカル開発DBを共用します。実行前に[テスト運用ルール 第6章](../運用/テスト運用ルール.md#6-dbへ接続するテストの事前確認)で接続先・変更範囲・既存データの保全方法を確認します。テスト用タスクを削除しても他タスクの順序番号まで復元されるとは限りません。

## タスクの削除API

`DELETE /api/tasks/{id}` は対象レコードを物理削除し、成功時は204 No Content（本文なし）を返します。リクエスト本文は不要です。任意のbooleanクエリ `skipConfirmation` は省略時false、trueの場合は削除と同時に削除確認を省略する設定を保存します。不正なbooleanは400です。不正なUUIDは400、存在しないUUIDと削除済みUUIDへの再要求は404です。論理削除フラグや復元機能は設けません。

登録・編集・移動と同じPostgreSQLアドバイザリロックを取得し、対象の存在確認と削除を同一トランザクションで行います。残ったタスクのsortOrderは詰めず、内容・進捗・順序番号を変更しません。採番に欠番があっても一覧の相対順序は維持されます。削除自体はtasksのスキーマを変えません。確認省略設定はV2のapp_settingに保存します。

削除テストは `./gradlew test --tests '*TaskDeleteApiTests'` で選択できます。MockMvcでControllerから実PostgreSQLまでを通し、APIのコミット後に別接続で物理的な不存在を確認します。HTTPサーバーのポートは開きません。専用UUIDの行だけを後片付けし、既存行の全項目が不変であることを照合します。

### 削除確認の設定

`GET /api/settings` は200と `{"confirmDelete":true}` または `{"confirmDelete":false}` を返します。初期値はtrueです。設定を取得できないときはフロントが削除を進めません。

Flyway `V2__create_app_setting.sql` は `app_setting` を新設し、id=1、confirm_delete=trueの行を作成します。idはSMALLINT主キーかつ1のみ、confirm_deleteはBOOLEAN NOT NULLで既定trueです。列ソート設定はこのテーブルにはまだ持ちません。

`skipConfirmation=true` の削除は、タスク削除と `confirm_delete=false` の更新を同じトランザクションで確定します。設定更新失敗・更新0件では削除もロールバックします。省略・falseの削除は現在の設定を変更しません。存在しないタスクの要求で設定だけ変わることはありません。設定をtrueに戻すAPIは現時点では提供しません。

設定を含む試験は `./gradlew test --tests '*DeleteConfirmationApiTests' --tests '*TaskDeleteApiTests'` で選択します。設定の元値を保存・復元し、設定保存の例外/0件更新で削除がロールバックされることと、コミット後の取得結果を確認します。共有設定を一時的に変更するため、実アプリのバックエンドを通常停止し、同時操作を避けて実行してください。

## 静的品質チェック

backendディレクトリで配置済みJava 25を使い、`GRADLE_USER_HOME=/private/tmp/taskmanager-gradle ./gradlew checkstyleMain checkstyleTest` を実行します。DB接続は不要です。Gradle標準Checkstyleプラグインを使用し、ツール版はbuild.gradleに固定します。未使用/重複import、型・メソッド名、equals/hashCodeの組、空catch等を検査します。大量の整形を強制する設定ではありません。`check` にも両タスクが組み込まれますが、`check` は実DBを使うtestも実行するため、静的検査だけなら上記タスクを指定してください。

Checkstyleはソース上の規則を調べるもので、null安全性・SQL・トランザクションの正しさや脆弱性を保証する検査ではありません。

タイトルの前後空白は登録・編集の共通リクエスト型で正規化し、除去後のコードポイント数を検証します。画面とAPIの空白集合は[機能仕様書](../機能仕様書.md#タイトルの空白正規化)を正とします。内部の空白は保持します。
