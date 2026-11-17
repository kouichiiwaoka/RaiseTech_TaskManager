package com.example.taskmanager.task;

import java.util.List;
import java.net.URI;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {
    private final TaskService service;

    public TaskController(TaskService service) {
        this.service = service;
    }

    @PutMapping("/{id}")
    public TaskResponse update(@PathVariable UUID id, @RequestBody CreateTaskRequest request) {
        return service.update(id, request);
    }

    @PatchMapping("/{id}/position")
    public TaskResponse move(@PathVariable UUID id, @RequestBody MoveTaskRequest request) {
        return service.move(id, request);
    }

    @PostMapping
    public ResponseEntity<TaskResponse> create(@RequestBody CreateTaskRequest request) {
        TaskResponse result = service.create(request);
        return ResponseEntity.created(URI.create("/api/tasks/" + result.id())).body(result);
    }

    @GetMapping
    public List<TaskResponse> list(@RequestParam(required = false) String status,
                                   @RequestParam(defaultValue = "") String q) {
        if (status != null && !Set.of("todo", "doing", "done").contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status");
        }
        return service.list(status, q);
    }

    @GetMapping("/{id}")
    public TaskResponse detail(@PathVariable UUID id) {
        return service.detail(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found"));
    }
}
