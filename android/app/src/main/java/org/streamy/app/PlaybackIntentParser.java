package org.streamy.app;

final class PlaybackIntentParser {
    private PlaybackIntentParser() {}

    static int parseInt(Object value, int fallback) {
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        try {
            return Integer.parseInt(value == null ? "" : String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    static long parseLong(Object value, long fallback) {
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        try {
            return Long.parseLong(value == null ? "" : String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }
}
