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

    public List<TaskResponse> list(String status, String query) {
        return repository.search(status, query.strip()).stream().map(Task::response).toList();
    }

    public Optional<TaskResponse> detail(UUID id) {
        return repository.findById(id).map(Task::response);
    }
}
