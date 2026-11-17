package com.example.taskmanager.task;

import java.time.LocalDate;

public record CreateTaskRequest(String title, String description, String priority, LocalDate dueDate) {
    public CreateTaskRequest {
        title = normalizeTitle(title);
    }

    static String normalizeTitle(String value) {
        if (value == null) return null;
        int start = 0;
        int end = value.length();
        while (start < end && titleSpace(value.codePointAt(start))) {
            start += Character.charCount(value.codePointAt(start));
        }
        while (end > start && titleSpace(value.codePointBefore(end))) {
            end -= Character.charCount(value.codePointBefore(end));
        }
        return value.substring(start, end);
    }

    private static boolean titleSpace(int codePoint) {
        return Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint)
                || codePoint == 0x85 || codePoint == 0xFEFF;
    }
}
