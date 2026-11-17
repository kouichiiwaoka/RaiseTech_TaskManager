package com.example.taskmanager.task;
import java.util.UUID;
public record MoveTaskRequest(String status, UUID beforeId) {}
