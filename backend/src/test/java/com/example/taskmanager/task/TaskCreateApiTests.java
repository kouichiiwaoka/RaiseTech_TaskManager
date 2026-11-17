package com.example.taskmanager.task;

import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.http.MediaType;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TaskCreateApiTests {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    final String marker = "create-test-" + UUID.randomUUID();
    RestClient client;
    @BeforeEach void setup() { client = RestClient.create("http://127.0.0.1:" + port); }
    @AfterEach void cleanup() { jdbc.update("DELETE FROM tasks WHERE title LIKE ?", marker + "%"); }
    TaskResponse create(Map<String, ?> input) {
        return client.post().uri("/api/tasks").contentType(MediaType.APPLICATION_JSON).body(input).retrieve().body(TaskResponse.class);
    }
    @Test void createsWithDefaultsAndPersistsInSavedOrder() {
        int previous = jdbc.queryForObject("SELECT COALESCE(MAX(sort_order),-1) FROM tasks WHERE status='todo'", Integer.class);
        var response = client.post().uri("/api/tasks").contentType(MediaType.APPLICATION_JSON)
            .body(Map.of("title", "  " + marker + " first  ")).retrieve().toEntity(TaskResponse.class);
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        var first = response.getBody();
        assertThat(response.getHeaders().getLocation().toString()).isEqualTo("/api/tasks/" + first.id());
        assertThat(first.title()).isEqualTo(marker + " first");
        assertThat(first.priority()).isEqualTo("medium");
        assertThat(first.status()).isEqualTo("todo");
        assertThat(first.description()).isNull();
        assertThat(first.dueDate()).isNull();
        assertThat(first.sortOrder()).isEqualTo(previous + 1);
        var second = create(Map.of("title", marker + " second", "description", "架空の説明", "priority", "high", "dueDate", "2026-12-01"));
        assertThat(second.sortOrder()).isEqualTo(first.sortOrder() + 1);
        assertThat(second.description()).isEqualTo("架空の説明");
        assertThat(second.dueDate().toString()).isEqualTo("2026-12-01");
        assertThat(client.get().uri("/api/tasks/" + second.id()).retrieve().body(TaskResponse.class)).isEqualTo(second);
        assertThat(jdbc.queryForList("SELECT id FROM tasks WHERE title LIKE ? ORDER BY sort_order,id", UUID.class, marker + "%"))
            .containsExactly(first.id(), second.id());
    }
    @Test void rejectsInvalidInputWithoutSaving() {
        for (var input : List.of(Map.of("title", " "), Map.of("title", marker + "a".repeat(256)),
            Map.of("title", marker, "priority", "invalid"), Map.of("title", marker, "dueDate", "invalid"), Map.of("description", "no title"))) {
            assertThatThrownBy(() -> create(input)).isInstanceOf(HttpClientErrorException.BadRequest.class);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM tasks WHERE title LIKE ?", Integer.class, marker + "%")).isZero();
    }
    @Test void concurrentCreatesUseDifferentIncreasingPositions() throws Exception {
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> create(Map.of("title", marker + " concurrent-a")));
            var second = executor.submit(() -> create(Map.of("title", marker + " concurrent-b")));
            var a = first.get(20, TimeUnit.SECONDS);
            var b = second.get(20, TimeUnit.SECONDS);
            assertThat(a.sortOrder()).isNotEqualTo(b.sortOrder());
            assertThat(Math.abs(a.sortOrder() - b.sortOrder())).isEqualTo(1);
        }
    }
}
