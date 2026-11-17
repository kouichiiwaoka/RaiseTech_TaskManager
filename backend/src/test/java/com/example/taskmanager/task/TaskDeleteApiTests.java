package com.example.taskmanager.task;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class TaskDeleteApiTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    final List<UUID> ids = new ArrayList<>();
    String baseline;

    String fingerprint() {
        // データ本文を出力せず、既存行の全項目が保全されたことを確認する。
        return jdbc.queryForObject("SELECT md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY id), '')) FROM tasks t", String.class);
    }

    @BeforeEach void setup() { baseline = fingerprint(); }

    UUID insert(String status) {
        UUID id = UUID.randomUUID();
        ids.add(id);
        jdbc.update("INSERT INTO tasks (id, title, description, priority, status, sort_order) VALUES (?, ?, ?, 'high', ?, 17)",
                id, "delete-test-" + id, "架空の削除確認用タスク", status);
        return id;
    }

    @AfterEach void cleanup() {
        for (UUID id : ids) jdbc.update("DELETE FROM tasks WHERE id = ?", id);
        assertThat(baseline.equals(fingerprint())).as("既存行の全項目を保全する").isTrue();
    }

    @Test void physicallyDeletesEachStatusAndPreservesOtherRowsAfterCommit() throws Exception {
        UUID other = insert("todo");
        var unchanged = jdbc.queryForMap("SELECT * FROM tasks WHERE id = ?", other);
        for (String status : List.of("todo", "doing", "done")) {
            UUID id = insert(status);
            mvc.perform(delete("/api/tasks/" + id)).andExpect(status().isNoContent()).andExpect(content().string(""));
            // 外側Txを設けず、APIのコミット後にJdbcTemplateの別接続で直接確認する。
            assertThat(jdbc.queryForObject("SELECT count(*) FROM tasks WHERE id = ?", Integer.class, id)).isZero();
            mvc.perform(get("/api/tasks/" + id)).andExpect(status().isNotFound());
            mvc.perform(get("/api/tasks").param("q", "delete-test-" + id)).andExpect(status().isOk()).andExpect(content().json("[]"));
            mvc.perform(delete("/api/tasks/" + id)).andExpect(status().isNotFound());
            assertThat(unchanged.equals(jdbc.queryForMap("SELECT * FROM tasks WHERE id = ?", other))).isTrue();
        }
    }

    @Test void rejectsInvalidAndMissingIdsAndDoesNotRecreateDeletedTasks() throws Exception {
        UUID existing = insert("doing");
        String before = fingerprint();
        mvc.perform(delete("/api/tasks/not-a-uuid")).andExpect(status().isBadRequest());
        mvc.perform(delete("/api/tasks/" + UUID.randomUUID())).andExpect(status().isNotFound());
        assertThat(before.equals(fingerprint())).isTrue();
        mvc.perform(delete("/api/tasks/" + existing)).andExpect(status().isNoContent());
        mvc.perform(put("/api/tasks/" + existing).contentType("application/json")
                .content("{\"title\":\"架空の編集\",\"priority\":\"low\"}")).andExpect(status().isNotFound());
        mvc.perform(patch("/api/tasks/" + existing + "/position").contentType("application/json")
                .content("{\"status\":\"todo\",\"beforeId\":null}")).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tasks WHERE id = ?", Integer.class, existing)).isZero();
    }
}
