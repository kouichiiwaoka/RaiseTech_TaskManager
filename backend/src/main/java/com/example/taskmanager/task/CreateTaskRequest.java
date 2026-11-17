package com.example.taskmanager.task;

import java.time.LocalDate;

public record CreateTaskRequest(String title, String description, String priority, LocalDate dueDate) {}
