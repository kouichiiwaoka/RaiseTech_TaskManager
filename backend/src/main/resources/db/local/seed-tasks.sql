-- Local demonstration only. Not included in Flyway migrations.
-- Re-running preserves existing rows, including any edited sample tasks.
INSERT INTO tasks (id, title, description, priority, due_date, status, sort_order)
VALUES
('00000000-0000-4000-8000-000000000001', 'API仕様を確認する', 'READ APIのレスポンス項目を確認する', 'high', '2026-11-20', 'todo', 0),
('00000000-0000-4000-8000-000000000002', 'テスト項目を整理する', NULL, 'medium', NULL, 'todo', 1),
('00000000-0000-4000-8000-000000000003', 'API取得を検証する', 'PostgreSQLから実データを取得する', 'high', '2026-11-21', 'doing', 0),
('00000000-0000-4000-8000-000000000004', 'ローカルDBを起動する', '架空のデモタスク', 'low', '2026-11-15', 'done', 0)
ON CONFLICT (id) DO NOTHING;
