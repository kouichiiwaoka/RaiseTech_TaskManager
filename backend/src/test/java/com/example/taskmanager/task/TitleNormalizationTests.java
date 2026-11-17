package com.example.taskmanager.task;

import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class TitleNormalizationTests {
    @Test void trimsSharedWhitespaceAndPreservesInternalCharacters() {
        for (String space : List.of("\u00a0", "\u202f", "\ufeff", "\u0085", "\u001c", "\u001d", "\u001e", "\u001f", "\u3000", "\t", "\n")) {
            assertThat(new CreateTaskRequest(space + space, null, null, null).title()).isEmpty();
            assertThat(new CreateTaskRequest(space + "日" + space + "😀" + space, null, null, null).title()).isEqualTo("日" + space + "😀");
        }
        assertThat(new CreateTaskRequest("\u00a0" + "😀".repeat(255) + "\ufeff", null, null, null).title().codePointCount(0, 510)).isEqualTo(255);
    }
}
