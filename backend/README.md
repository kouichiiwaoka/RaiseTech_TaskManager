# Task Manager バックエンドの初期設定

Java 25 LTS / Spring Boot 4.1.2 / Gradle 9.8.2（Groovy DSL）を使用します。Gradle Wrapperを同梱しています。

## 準備

JDK 25を使用してください。今回のmacOS Intel環境には、Git対象外の `.local/` にJDKを配置済みです。

```sh
cd backend
export JAVA_HOME="$PWD/.local/jdk-25.0.5+8/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
./gradlew --version
./gradlew help
```

別端末ではJDK 25を別途用意してください。初回は公開依存関係を取得するためネットワーク接続が必要です。

## 範囲

今回はGradleのビルド設定、Wrapper、最低限の設定ファイルまでを対象とします。API・業務処理・DB接続設定・マイグレーションは今後実装します。採用DBはPostgreSQLです。

現在のローカル作業ツリーには、Spring Initializr生成の起動クラスと疎通確認用テストが残っています。Javaファイルの削除は利用者が行う方針のため、自動では削除していません。これらのJavaファイルがある状態で、次の動作確認を実施しました。

## ローカルでの動作確認

2026年11月15日にJava 25でテスト1件成功、JAR生成、起動後の `/actuator/health` の `status: UP` を確認済みです。確認後はサーバーを停止しています。DB接続を確認したものではありません。

起動クラスとテストが残っている場合は、準備の環境変数を設定したターミナルで次を実行できます。

```sh
./gradlew test bootJar
./gradlew bootRun
```

起動したターミナルを開いたまま、別のターミナルまたはブラウザで確認します。

```sh
curl --fail http://127.0.0.1:8080/actuator/health
```

JSON内の `"status":"UP"` が正常応答です。`ERR_CONNECTION_REFUSED` はサーバー停止中などで接続できない状態を示します。

停止は、起動したターミナルで **Control（⌃）+ C** を押します。MacでもCommand（⌘）ではなくControlを使用します。

Javaファイル削除後は実装前の初期設定として扱い、`./gradlew help` でGradle設定を確認してください。起動クラスを再度用意するまで `bootRun` と `bootJar` は利用しません。

## DB連携の状態

PostgreSQLとは未接続です。Spring Data JPA / Hibernate、PostgreSQL JDBCドライバー、Flywayの依存関係・接続設定・マイグレーションは未追加です。Actuatorの `UP` はSpring Boot単体の状態を示します。

`.local/`、ビルド成果物、認証情報を含むローカル設定はGit対象外です。
