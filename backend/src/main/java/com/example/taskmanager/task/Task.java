package com.example.taskmanager.task;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "tasks")
public class Task {
    @Id
    private UUID id;
    private String title;
    @Column(columnDefinition = "text")
    private String description;
    @Column(length = 10)
    private String priority;
    private LocalDate dueDate;
    @Column(length = 10)
    private String status;
    private int sortOrder;

    protected Task() {}

    TaskResponse response() {
        return new TaskResponse(id, title, description, priority, dueDate, status, sortOrder);
    }
}
