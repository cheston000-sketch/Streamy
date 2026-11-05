package org.streamy.app;

import java.util.Locale;

final class SourcePageFailurePolicy {
    private SourcePageFailurePolicy() {}

    static boolean isVerificationFailure(String text) {
        if (text == null || text.length() > 5000) return false;
        String normalized = text.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
        return normalized.contains("verification failed") && normalized.contains("please reload");
    }
}
