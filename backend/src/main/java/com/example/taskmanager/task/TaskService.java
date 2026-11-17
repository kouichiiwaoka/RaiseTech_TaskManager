package com.example.taskmanager.task;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TaskService {
    private final TaskRepository repository;

    private final JdbcTemplate jdbc;

    public TaskService(TaskRepository repository, JdbcTemplate jdbc) {
        this.repository = repository;
        this.jdbc = jdbc;
    }

    @Transactional
    public TaskResponse create(CreateTaskRequest request) {
        String title = request.title() == null ? "" : request.title().strip();
        if (title.isBlank() || title.codePointCount(0, title.length()) > 255) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Title must contain 1 to 255 characters");
        }
        String priority = request.priority() == null ? "medium" : request.priority();
        if (!Set.of("high", "medium", "low").contains(priority)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid priority");
        }
        // PostgreSQLのトランザクションロックで、空の列への同時追加も直列化する。
        jdbc.execute("SELECT pg_advisory_xact_lock(11001)");
        Long next = jdbc.queryForObject("SELECT COALESCE(MAX(sort_order)::bigint, -1) + 1 FROM tasks WHERE status = 'todo'", Long.class);
        if (next == null || next > Integer.MAX_VALUE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Task order limit reached");
        }
        String description = request.description();
        if (description != null && description.isBlank()) description = null;
        return repository.saveAndFlush(new Task(title, description, priority, request.dueDate(), next.intValue())).response();
    }

    @Transactional
    public TaskResponse update(UUID id, CreateTaskRequest request) {
        String title = request.title() == null ? "" : request.title().strip();
        if (title.isBlank() || title.codePointCount(0, title.length()) > 255
                || request.priority() == null || !Set.of("high", "medium", "low").contains(request.priority())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid task fields");
        }
        jdbc.execute("SELECT pg_advisory_xact_lock(11001)");
        Task task = required(id);
        String description = request.description();
        task.update(title, description == null || description.isBlank() ? null : description, request.priority(), request.dueDate());
        repository.flush();
        return task.response();
    }

    @Transactional
    public TaskResponse move(UUID id, MoveTaskRequest request) {
        if (request.status() == null || !Set.of("todo", "doing", "done").contains(request.status())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status");
        }
        jdbc.execute("SELECT pg_advisory_xact_lock(11001)");
        Task task = required(id);
        String source = task.taskStatus();
        if (id.equals(request.beforeId())) {
            if (!source.equals(request.status())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Invalid destination");
            return task.response();
        }
        var destination = new java.util.ArrayList<>(repository.search(request.status(), ""));
        destination.removeIf(t -> t.taskId().equals(id));
        int position = destination.size();
        if (request.beforeId() != null) {
            position = -1;
            for (int i = 0; i < destination.size(); i++) {
                if (destination.get(i).taskId().equals(request.beforeId())) position = i;
            }
            if (position < 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "Destination changed; reload board");
        }
        if (!source.equals(request.status())) {
            var remaining = repository.search(source, "");
            int order = 0;
            for (Task t : remaining) if (!t.taskId().equals(id)) t.place(source, order++);
        }
        destination.add(position, task);
        for (int i = 0; i < destination.size(); i++) destination.get(i).place(request.status(), i);
        repository.flush();
        return task.response();
    }

    @Transactional
    public void delete(UUID id, boolean skipConfirmation) {
        // 登録・編集・移動と同じロックを取り、削除との競合を直列化する。
        jdbc.execute("SELECT pg_advisory_xact_lock(11001)");
        repository.delete(required(id));
        repository.flush();
        if (skipConfirmation) {
            int updated = jdbc.update("UPDATE app_setting SET confirm_delete = false WHERE id = 1");
            if (updated != 1) {
                throw new IllegalStateException("App setting row is missing");
            }
        }
    }

    public AppSettingsResponse settings() {
        return new AppSettingsResponse(Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT confirm_delete FROM app_setting WHERE id = 1", Boolean.class)));
    }

    private Task required(UUID id) {
        return repository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found"));
    }

    public List<TaskResponse> list(String status, String query) {
        return repository.search(status, query.strip()).stream().map(Task::response).toList();
    }

    public Optional<TaskResponse> detail(UUID id) {
        return repository.findById(id).map(Task::response);
    }
}
