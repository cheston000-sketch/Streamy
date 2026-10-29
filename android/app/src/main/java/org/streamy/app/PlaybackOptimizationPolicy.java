package org.streamy.app;

import java.util.Locale;

/** Playback tuning only; compression requires an alternate encode supplied by the host. */
final class PlaybackOptimizationPolicy {
    enum Mode { AUTO, DATA_SAVER, ORIGINAL }

    static final int DATA_SAVER_MAX_WIDTH = 1280;
    static final int DATA_SAVER_MAX_HEIGHT = 720;
    static final int DATA_SAVER_MAX_BITRATE = 2_500_000;
    static final int QUALITY_INCREASE_BUFFER_MS = 20_000;
    static final int QUALITY_DECREASE_BUFFER_MS = 30_000;
    static final int RETAIN_BUFFER_AFTER_DISCARD_MS = 30_000;
    static final float BANDWIDTH_FRACTION = 0.65f;

    static final class BufferingProfile {
        final int minBufferMs;
        final int maxBufferMs;
        final int startBufferMs;
        final int rebufferMs;
        final int targetBytes;

        private BufferingProfile(int minBufferMs, int maxBufferMs, int startBufferMs,
                                 int rebufferMs, int targetBytes) {
            this.minBufferMs = minBufferMs;
            this.maxBufferMs = maxBufferMs;
            this.startBufferMs = startBufferMs;
            this.rebufferMs = rebufferMs;
            this.targetBytes = targetBytes;
        }
    }

    private static final BufferingProfile ON_DEMAND =
        new BufferingProfile(30_000, 60_000, 2_500, 6_000, 64 * 1024 * 1024);

    private PlaybackOptimizationPolicy() {}

    static Mode parseMode(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if ("original".equals(normalized)) return Mode.ORIGINAL;
        if ("data-saver".equals(normalized)) return Mode.DATA_SAVER;
        return Mode.AUTO;
    }

    /** Null means preserve Media3's standard load control, including its startup behavior. */
    static BufferingProfile bufferingProfile(Mode mode) {
        if (mode == Mode.ORIGINAL) return null;
        return ON_DEMAND;
    }
}
