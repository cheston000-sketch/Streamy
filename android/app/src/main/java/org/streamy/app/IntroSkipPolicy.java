package org.streamy.app;

final class IntroSkipPolicy {
    private static final long MINIMUM_CONTENT_AFTER_SKIP_MS = 30_000L;
    private static final long MAXIMUM_INTRO_END_MS = 20 * 60_000L;

    private IntroSkipPolicy() {}

    static boolean shouldShow(String mediaKey, long markerStartMs, long markerEndMs, long positionMs, long durationMs, boolean dismissed) {
        return !dismissed
            && mediaKey != null
            && mediaKey.contains(":tv:")
            && isValidMarker(markerStartMs, markerEndMs, durationMs)
            && positionMs >= markerStartMs
            && positionMs < markerEndMs;
    }

    static boolean isValidMarker(long markerStartMs, long markerEndMs, long durationMs) {
        return markerStartMs >= 0L
            && markerEndMs > markerStartMs
            && markerEndMs <= MAXIMUM_INTRO_END_MS
            && durationMs > markerEndMs + MINIMUM_CONTENT_AFTER_SKIP_MS;
    }

    static boolean hasPassed(long markerEndMs, long positionMs) {
        return markerEndMs > 0L && positionMs >= markerEndMs;
    }

    static long resolveSeekPosition(long positionMs, long markerEndMs, long durationMs) {
        long targetPosition = Math.max(Math.max(0L, positionMs), markerEndMs);
        if (durationMs <= 0L) {
            return targetPosition;
        }
        return Math.min(targetPosition, Math.max(0L, durationMs - 1_000L));
    }
}
