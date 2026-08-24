package org.streamy.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NextEpisodePolicyTest {
    @Test
    public void autoplaysWhenEnabledAndTargetExists() {
        assertTrue(NextEpisodePolicy.shouldAutoplay(true, false, 2, 4));
    }

    @Test
    public void respectsDisabledSetting() {
        assertFalse(NextEpisodePolicy.shouldAutoplay(false, false, 2, 4));
    }

    @Test
    public void respectsPerEpisodeDismissal() {
        assertFalse(NextEpisodePolicy.shouldAutoplay(true, true, 2, 4));
    }

    @Test
    public void requiresAValidNextEpisode() {
        assertFalse(NextEpisodePolicy.shouldAutoplay(true, false, 0, 0));
    }
}
