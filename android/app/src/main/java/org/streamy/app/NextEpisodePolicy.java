package org.streamy.app;

final class NextEpisodePolicy {
    private NextEpisodePolicy() {}

    static boolean shouldAutoplay(boolean enabled, boolean dismissed, int nextSeason, int nextEpisode) {
        return enabled && !dismissed && nextSeason > 0 && nextEpisode > 0;
    }
}
