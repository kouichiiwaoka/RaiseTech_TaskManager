CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT,
    priority VARCHAR(10) NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('high', 'medium', 'low')),
    due_date DATE,
    status VARCHAR(10) NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'doing', 'done')),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0)
);
CREATE INDEX tasks_status_sort_order_idx ON tasks (status, sort_order);
