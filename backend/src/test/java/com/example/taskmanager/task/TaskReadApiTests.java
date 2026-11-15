package com.example.taskmanager.task;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.HttpClientErrorException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TaskReadApiTests {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    final UUID first = UUID.randomUUID();
    final UUID second = UUID.randomUUID();
    final UUID third = UUID.randomUUID();
    final String marker = UUID.randomUUID().toString();
    RestClient client;

    @BeforeEach
    void seed() {
        client = RestClient.create("http://127.0.0.1:" + port);
        insert(first, marker + " API 100%_", "todo", 1, "high", LocalDate.of(2026, 11, 20));
        insert(second, marker + " second", "todo", 0, "medium", null);
        insert(third, marker + " api third", "doing", 0, "low", null);
    }

    void insert(UUID id, String title, String status, int order, String priority, LocalDate date) {
        jdbc.update("INSERT INTO tasks (id,title,description,status,sort_order,priority,due_date) VALUES (?,?,?,?,?,?,?)",
                id, title, null, status, order, priority, date);
    }

    @AfterEach
    void cleanup() {
        // Remove only this test's randomly identified rows; retain existing local data.
        jdbc.update("DELETE FROM tasks WHERE id IN (?,?,?)", first, second, third);
    }

    List<TaskResponse> search(String status, String query) {
        return client.get().uri(builder -> {
            builder.path("/api/tasks").queryParam("q", query);
            if (status != null) builder.queryParam("status", status);
            return builder.build();
        }).retrieve().body(new ParameterizedTypeReference<List<TaskResponse>>() {});
    }

    @Test
    void listsAllTasksInColumnAndSavedOrder() {
        assertThat(search(null, "")).extracting(TaskResponse::id)
                .containsSubsequence(second, first, third);
    }

    @Test
    void searchesTitleCaseInsensitivelyAndCombinesStatus() {
        assertThat(search(null, marker + " API")).extracting(TaskResponse::id)
                .containsExactly(first, third);
        assertThat(search("doing", marker + " API")).extracting(TaskResponse::id)
                .containsExactly(third);
        assertThat(search("done", marker)).isEmpty();
    }

    @Test
    void treatsSqlWildcardCharactersLiterallyAndTrimsQuery() {
        assertThat(search(null, "  " + marker + " API 100%_  "))
                .extracting(TaskResponse::id).containsExactly(first);
        assertThat(search(null, marker + " missing")).isEmpty();
    }

    @Test
    void getsAllFieldsIncludingDateAndNulls() {
        var result = client.get().uri("/api/tasks/" + first).retrieve().body(TaskResponse.class);
        assertThat(result).isEqualTo(new TaskResponse(first, marker + " API 100%_", null,
                "high", LocalDate.of(2026, 11, 20), "todo", 1));
        var optional = client.get().uri("/api/tasks/" + second).retrieve().body(TaskResponse.class);
        assertThat(optional.dueDate()).isNull();
        assertThat(optional.description()).isNull();
    }

    @Test
    void returns404ForMissingTask() {
        assertThatThrownBy(() -> client.get().uri("/api/tasks/" + UUID.randomUUID()).retrieve().toBodilessEntity())
                .isInstanceOf(HttpClientErrorException.NotFound.class);
    }

    @Test
    void returns400ForInvalidUuidAndStatus() {
        assertThatThrownBy(() -> client.get().uri("/api/tasks/not-a-uuid").retrieve().toBodilessEntity())
                .isInstanceOf(HttpClientErrorException.BadRequest.class);
        assertThatThrownBy(() -> search("invalid", marker))
                .isInstanceOf(HttpClientErrorException.BadRequest.class);
    }
}
