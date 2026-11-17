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
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class DeleteConfirmationApiTests {
    @Autowired MockMvc mvc;
    @MockitoSpyBean JdbcTemplate jdbc;
    static final String SAVE_SETTING = "UPDATE app_setting SET confirm_delete = false WHERE id = 1";
    final List<UUID> ids = new ArrayList<>();
    boolean original;
    String baseline;

    String fingerprint() {
        return jdbc.queryForObject("SELECT md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY id), '')) FROM tasks t", String.class);
    }
    boolean confirmDelete() { return Boolean.TRUE.equals(jdbc.queryForObject("SELECT confirm_delete FROM app_setting WHERE id = 1", Boolean.class)); }
    @BeforeEach void setup() {
        original = confirmDelete();
        baseline = fingerprint();
        jdbc.update("UPDATE app_setting SET confirm_delete = true WHERE id = 1");
    }
    @AfterEach void cleanup() {
        reset(jdbc);
        try {
            for (UUID id : ids) jdbc.update("DELETE FROM tasks WHERE id = ?", id);
        } finally {
            jdbc.update("UPDATE app_setting SET confirm_delete = ? WHERE id = 1", original);
        }
        assertThat(confirmDelete()).isEqualTo(original);
        assertThat(baseline.equals(fingerprint())).as("既存タスク全項目不変").isTrue();
    }
    UUID insert() {
        UUID id = UUID.randomUUID(); ids.add(id);
        jdbc.update("INSERT INTO tasks(id,title) VALUES (?,?)", id, "delete-setting-test-" + id);
        return id;
    }
    int count(UUID id) { return jdbc.queryForObject("SELECT count(*) FROM tasks WHERE id = ?", Integer.class, id); }

    @Test void persistsSkipPreferenceWithDeletionAndKeepsItForLaterDeletes() throws Exception {
        assertThat(jdbc.queryForObject("SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'app_setting' AND column_name = 'confirm_delete'", String.class)).isEqualTo("true");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app_setting", Integer.class)).isEqualTo(1);
        mvc.perform(get("/api/settings")).andExpect(status().isOk()).andExpect(jsonPath("$.confirmDelete").value(true));
        UUID first = insert();
        mvc.perform(delete("/api/tasks/" + first)).andExpect(status().isNoContent());
        assertThat(confirmDelete()).isTrue();
        UUID second = insert();
        mvc.perform(delete("/api/tasks/" + second).param("skipConfirmation", "true")).andExpect(status().isNoContent()).andExpect(content().string(""));
        // テスト外側Txなし。APIのコミット後の別接続で両方の保存結果を検証。
        assertThat(count(second)).isZero();
        assertThat(confirmDelete()).isFalse();
        mvc.perform(get("/api/settings")).andExpect(status().isOk()).andExpect(jsonPath("$.confirmDelete").value(false));
        UUID third = insert();
        mvc.perform(delete("/api/tasks/" + third)).andExpect(status().isNoContent());
        assertThat(confirmDelete()).isFalse();
    }

    @Test void rejectsMissingTasksAndInvalidParametersWithoutChangingPreference() throws Exception {
        UUID id = insert();
        mvc.perform(delete("/api/tasks/" + UUID.randomUUID()).param("skipConfirmation", "true")).andExpect(status().isNotFound());
        mvc.perform(delete("/api/tasks/" + id).param("skipConfirmation", "invalid")).andExpect(status().isBadRequest());
        mvc.perform(delete("/api/tasks/not-a-uuid").param("skipConfirmation", "true")).andExpect(status().isBadRequest());
        assertThat(count(id)).isEqualTo(1);
        assertThat(confirmDelete()).isTrue();
    }

    @Test void rollsBackDeletionWhenPreferenceSaveFails() {
        UUID id = insert();
        doThrow(new DataAccessResourceFailureException("simulated setting failure")).when(jdbc).update(SAVE_SETTING);
        assertThatThrownBy(() -> mvc.perform(delete("/api/tasks/" + id).param("skipConfirmation", "true")))
                .hasRootCauseInstanceOf(DataAccessResourceFailureException.class);
        assertThat(count(id)).isEqualTo(1);
        assertThat(confirmDelete()).isTrue();
    }

    @Test void rollsBackDeletionWhenPreferenceUpdateAffectsNoRows() {
        UUID id = insert();
        doReturn(0).when(jdbc).update(SAVE_SETTING);
        assertThatThrownBy(() -> mvc.perform(delete("/api/tasks/" + id).param("skipConfirmation", "true")))
                .hasRootCauseInstanceOf(IllegalStateException.class);
        assertThat(count(id)).isEqualTo(1);
        assertThat(confirmDelete()).isTrue();
    }
}
