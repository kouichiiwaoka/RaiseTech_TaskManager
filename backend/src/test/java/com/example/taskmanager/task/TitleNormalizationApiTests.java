package com.example.taskmanager.task;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class TitleNormalizationApiTests {
    @Autowired MockMvc mvc;
    @Autowired TaskService service;

    @Test void createAndUpdateRejectWhitespaceAndCheckTrimmedUnicodeLength() throws Exception {
        UUID id = service.create(new CreateTaskRequest("title-test-" + UUID.randomUUID(), null, null, null)).id();
        for (String title : new String[]{"\\u00a0", "\\u202f", "\\ufeff", "\\u0085", "\\u001c\\u001d\\u001e\\u001f", "\\u3000"}) {
            String body = "{\"title\":\"" + title + "\",\"priority\":\"medium\"}";
            mvc.perform(post("/api/tasks").contentType("application/json").content(body)).andExpect(status().isBadRequest());
            mvc.perform(put("/api/tasks/" + id).contentType("application/json").content(body)).andExpect(status().isBadRequest());
        }
        for (int length : new int[]{255, 256}) {
            String body = "{\"title\":\"\\u00a0" + "😀".repeat(length) + "\\ufeff\",\"priority\":\"medium\"}";
            var created = mvc.perform(post("/api/tasks").contentType("application/json").content(body));
            var edited = mvc.perform(put("/api/tasks/" + id).contentType("application/json").content(body));
            if (length == 255) {
                created.andExpect(status().isCreated()).andExpect(jsonPath("$.title").value("😀".repeat(length)));
                edited.andExpect(status().isOk()).andExpect(jsonPath("$.title").value("😀".repeat(length)));
            } else {
                created.andExpect(status().isBadRequest());
                edited.andExpect(status().isBadRequest());
            }
        }
    }
}
