package org.streamy.app;

final class PlaybackProgressPolicy {
    static final long RESUME_MIN_POSITION_MS = 30_000L;
    static final long COMPLETE_THRESHOLD_MS = 60_000L;

    enum Action {
        KEEP_EXISTING,
        SAVE,
        CLEAR
    }

    private PlaybackProgressPolicy() {
    }

    static Action evaluate(long positionMs, long durationMs) {
        long safePositionMs = Math.max(0L, positionMs);
        if (durationMs > 0L && durationMs - safePositionMs <= COMPLETE_THRESHOLD_MS) {
            return Action.CLEAR;
        }
        if (safePositionMs < RESUME_MIN_POSITION_MS) {
            return Action.KEEP_EXISTING;
        }
        return Action.SAVE;
    }

    static long resolveFailoverPosition(long pendingPositionMs, long livePositionMs) {
        return Math.max(Math.max(0L, pendingPositionMs), Math.max(0L, livePositionMs));
    }
}
