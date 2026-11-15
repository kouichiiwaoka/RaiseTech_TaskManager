package com.example.taskmanager.task;

import java.time.LocalDate;
import java.util.UUID;

public record TaskResponse(UUID id, String title, String description, String priority,
                           LocalDate dueDate, String status, int sortOrder) {}
