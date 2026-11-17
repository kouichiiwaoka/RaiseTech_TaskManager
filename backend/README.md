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

DB名・ユーザー名は `taskmanager`、接続先は `127.0.0.1:5432` に固定します。競合時は別ポートへ変更せず、起動元を確認して競合する他プロジェクトのローカルサービスを通常停止します。同じプロジェクトの正常なサービスは再利用します。起動全体の手順は[統一起動スキル](../skills/start-frontend-backend/SKILL.md)を参照してください。

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

2026年11月15日、この環境でテスト2件成功とJAR生成を確認済みです。

## スキーマ管理と実装範囲

Spring Data JPA / Hibernate、PostgreSQL JDBCドライバー、Flywayを導入済みです。[Spring Bootの公式手順](https://docs.spring.io/spring-boot/how-to/data-initialization.html)に従い、起動時に `src/main/resources/db/migration` のSQLを適用します。HibernateのDDL自動作成は無効で、`validate` を指定しています。

V1では `tasks` テーブルを作成します。IDはUUID、タイトルは255文字以内かつ空白のみを禁止。優先度は `high / medium / low`（初期値 `medium`）、状態は `todo / doing / done`（初期値 `todo`）、期限はDATE、並び順は0以上です。適用済みSQLは変更せず、次のバージョンのSQLを追加してください。

タスクのJPAエンティティとREAD APIを実装済みです。実アプリのフロントエンドとの検索・閲覧連携も実装済みです。POSTによる新規登録も実装済みです。更新・削除APIとアプリ設定テーブルは今後の実装です。`prototype/`は独立した画面確認用デモで、APIとは接続しません。

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

2026年11月15日、既存2件とREAD APIの6件、計8件のテスト成功とJAR生成を確認しました。JARを `--server.port=8081` で起動し、curlで一覧4件・`status=doing&q=API` の検索1件・UUID指定の詳細1件を取得済みです。データ投入SQLの2回目は `INSERT 0 0` で重複がないことも確認しました。検証時のアクセス先は `http://127.0.0.1:8081/api/tasks` です。

上記の8081による検証記録は過去の実績です。現在の起動ルールではバックエンドは8080に固定し、競合回避に別ポートを使用しません。

画面からこのAPIへ検索条件が渡る流れと、Controller・Service・Repository・DBの役割は[学習メモ](../学習メモ.md)を参照してください。カード選択時の詳細表示は取得済み一覧データを使用し、上記の詳細取得APIは現在の画面からは呼びません。

## 5. タスクの新規登録API

`POST /api/tasks` に `Content-Type: application/json` を指定し、`title / description / priority / dueDate` を送信します。成功時は201 Created、Locationに詳細APIのパス、本文に登録済みのTaskResponseを返します。

```json
{"title":"架空の新規タスク","description":null,"priority":"medium","dueDate":null}
```

タイトルは前後空白を除き1〜255文字、priorityは省略・nullでmedium、指定する場合high / medium / lowです。descriptionとdueDateは任意で、期限はYYYY-MM-DDです。不正な入力は400です。IDはサーバーでUUIDを生成し、statusはtodo、sortOrderは未着手の最大値+1（空列なら0）とします。採番と保存を同一トランザクションで行い、PostgreSQLのトランザクション用アドバイザリロックで同時登録を直列化します。整数の採番上限に達した場合は409です。

再読み込み時は既存GET APIで永続化されたデータを取得します。優先度・期限の画面内ソート条件は保存しません。実PostgreSQLの登録・既定値・任意項目・再取得・入力拒否・同時採番を含む全11件のバックエンドテストとJAR生成を確認しました。
