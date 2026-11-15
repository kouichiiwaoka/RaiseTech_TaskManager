package com.example.taskmanager;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.client.RestClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TaskManagerApplicationTests {

    @LocalServerPort
    private int port;

    @Test
    void healthEndpointReportsUpWithDatabase() {
        var response = RestClient.create()
                .get()
                .uri("http://127.0.0.1:" + port + "/actuator/health")
                .retrieve()
                .body(String.class);

        assertThat(response).contains("\"status\":\"UP\"");
    }

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    @Transactional
    void backendCanWriteAndReadPostgres() {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO tasks (id, title) VALUES (?, ?)", id, "DB connection test");
        assertThat(jdbc.queryForObject("SELECT title FROM tasks WHERE id = ?", String.class, id))
                .isEqualTo("DB connection test");
        assertThat(jdbc.queryForObject("SELECT status FROM tasks WHERE id = ?", String.class, id))
                .isEqualTo("todo");
        assertThat(jdbc.queryForObject("SELECT priority FROM tasks WHERE id = ?", String.class, id))
                .isEqualTo("medium");
    }
}
