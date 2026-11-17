package com.example.taskmanager.task;

import java.util.*;
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
class TaskUpdateApiTests {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    final String marker = "edit-test-" + UUID.randomUUID();
    RestClient client;
    TaskResponse first, second;
    @BeforeEach void setup() {
        client = RestClient.create("http://127.0.0.1:" + port);
        first = create("first"); second = create("second");
    }
    TaskResponse create(String title) {
        return client.post().uri("/api/tasks").contentType(MediaType.APPLICATION_JSON).body(Map.of("title", marker + title)).retrieve().body(TaskResponse.class);
    }
    @AfterEach void cleanup() { jdbc.update("DELETE FROM tasks WHERE title LIKE ?", marker + "%"); }
    TaskResponse get(UUID id) { return client.get().uri("/api/tasks/" + id).retrieve().body(TaskResponse.class); }
    TaskResponse move(UUID id, String status, UUID before) {
        Map<String,Object> body = new HashMap<>(); body.put("status", status); body.put("beforeId", before);
        return client.patch().uri("/api/tasks/" + id + "/position").contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(TaskResponse.class);
    }
    @Test void updatesAllFieldsAndPreservesPosition() {
        var result = client.put().uri("/api/tasks/"+first.id()).contentType(MediaType.APPLICATION_JSON)
            .body(Map.of("title", marker+" edited", "description", "架空の説明", "priority", "high", "dueDate", "2026-12-24"))
            .retrieve().body(TaskResponse.class);
        assertThat(result.title()).isEqualTo(marker+" edited");
        assertThat(result.priority()).isEqualTo("high");
        assertThat(result.description()).isEqualTo("架空の説明");
        assertThat(result.dueDate().toString()).isEqualTo("2026-12-24");
        assertThat(result.status()).isEqualTo(first.status());
        assertThat(result.sortOrder()).isEqualTo(first.sortOrder());
        assertThat(get(first.id())).isEqualTo(result);
        var cleared=client.put().uri("/api/tasks/"+first.id()).contentType(MediaType.APPLICATION_JSON)
            .body(Map.of("title", marker+" edited", "priority", "low")).retrieve().body(TaskResponse.class);
        assertThat(cleared.description()).isNull(); assertThat(cleared.dueDate()).isNull();
    }
    @Test void movesBetweenThreeColumnsAndRestoresFromDb() {
        for(String status: List.of("doing","done","todo")) {
            var result=move(first.id(),status,null);
            assertThat(result.status()).isEqualTo(status); assertThat(get(first.id())).isEqualTo(result);
        }
        move(first.id(),"todo",second.id());
        assertThat(get(first.id()).sortOrder()).isLessThan(get(second.id()).sortOrder());
    }
    @Test void rejectsInvalidChangesAndDoesNotModifyExistingTask() {
        assertThatThrownBy(() -> client.put().uri("/api/tasks/"+first.id()).contentType(MediaType.APPLICATION_JSON)
            .body(Map.of("title"," ","priority","high")).retrieve().toBodilessEntity()).isInstanceOf(HttpClientErrorException.BadRequest.class);
        assertThatThrownBy(() -> move(first.id(),"invalid",null)).isInstanceOf(HttpClientErrorException.BadRequest.class);
        assertThatThrownBy(() -> move(first.id(),"done",second.id())).isInstanceOf(HttpClientErrorException.Conflict.class);
        assertThat(get(first.id())).isEqualTo(first);
        assertThatThrownBy(() -> move(UUID.randomUUID(),"todo",null)).isInstanceOf(HttpClientErrorException.NotFound.class);
    }
}
