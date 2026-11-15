package com.example.taskmanager.task;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TaskService {
    private final TaskRepository repository;

    public TaskService(TaskRepository repository) {
        this.repository = repository;
    }

    public List<TaskResponse> list(String status, String query) {
        return repository.search(status, query.strip()).stream().map(Task::response).toList();
    }

    public Optional<TaskResponse> detail(UUID id) {
        return repository.findById(id).map(Task::response);
    }
}
