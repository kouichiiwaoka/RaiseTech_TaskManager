# Task Manager バックエンド

Java 25 / Spring Boot 4.1.2 / Gradle 9.8.2。バックエンドはホストで、PostgreSQL 17はDocker Composeで動かします。Docker DesktopなどのDockerエンジンを起動しておいてください。

## 1. PostgreSQLを起動

リポジトリのルートで実行します。

```sh
sh scripts/setup-local-db.sh
docker compose up -d --wait
docker compose ps
```

セットアップはランダムなパスワードをGit対象外の `.env` に保存します。既存の `.env` は上書きしません。認証情報を含むため `.env` や `docker compose config` の出力を共有しないでください。

DB名・ユーザー名は `taskmanager`、接続先は `127.0.0.1:5432`。ポートが使用中なら `.env` の `DB_PORT` を変更します。バックエンドも同じ設定を読み込みます。外部DBを使う場合は環境変数 `DB_HOST` / `DB_PORT` / `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` を設定できます。

## 2. バックエンドを起動

```sh
cd backend
export JAVA_HOME="$PWD/.local/jdk-25.0.5+8/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
./gradlew bootRun
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
./gradlew test bootJar
```

実PostgreSQLを使用して、HTTPヘルスチェックとバックエンドのJdbcTemplate経由のタスク保存・取得・初期値を検証します。テストの挿入はトランザクションのロールバックで残りません。H2への置換は行いません。

2026年11月15日、この環境でテスト2件成功とJAR生成を確認済みです。

## スキーマ管理と実装範囲

Spring Data JPA / Hibernate、PostgreSQL JDBCドライバー、Flywayを導入済みです。[Spring Bootの公式手順](https://docs.spring.io/spring-boot/how-to/data-initialization.html)に従い、起動時に `src/main/resources/db/migration` のSQLを適用します。HibernateのDDL自動作成は無効で、`validate` を指定しています。

V1では `tasks` テーブルを作成します。IDはUUID、タイトルは255文字以内かつ空白のみを禁止。優先度は `high / medium / low`（初期値 `medium`）、状態は `todo / doing / done`（初期値 `todo`）、期限はDATE、並び順は0以上です。適用済みSQLは変更せず、次のバージョンのSQLを追加してください。

今回はDBの起動・接続・マイグレーション・読み書きの確認までです。タスク操作のREST API、JPAエンティティ、アプリ設定テーブル、プロトタイプとの連携は今後の実装です。

## 停止と永続化

ルートで `docker compose stop` を実行するとDBを停止します。再開は `docker compose up -d --wait` です。データは名前付きボリューム `postgres_data` に保存され、コンテナ再作成後も保持されます。ボリューム削除は行わないでください。

PostgreSQLの初期ユーザー・パスワード・DB名は初回のボリューム初期化時だけ反映されます。既存ボリュームに対して `.env` の認証設定だけ変更してもDB側は変更されません。
