CREATE TABLE app_setting (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    confirm_delete BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO app_setting (id, confirm_delete) VALUES (1, TRUE);
