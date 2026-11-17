package com.example.taskmanager.task;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/settings")
public class AppSettingsController {
    private final TaskService service;

    public AppSettingsController(TaskService service) {
        this.service = service;
    }

    @GetMapping
    public AppSettingsResponse settings() {
        return service.settings();
    }
}
