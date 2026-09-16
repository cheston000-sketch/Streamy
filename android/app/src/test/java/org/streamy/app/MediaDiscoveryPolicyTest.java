package org.streamy.app;

import static org.junit.Assert.*;
import org.junit.Test;

public class MediaDiscoveryPolicyTest {
    @Test public void rejectsBrowserOnlyAndFragmentUrlsEvenWithMimeType() {
        assertNull(MediaDiscoveryPolicy.mimeType("blob:https://player.videasy.to/abc", "video/mp4"));
        assertNull(MediaDiscoveryPolicy.mimeType("data:video/mp4;base64,abc", "video/mp4"));
        assertNull(MediaDiscoveryPolicy.mimeType("https://cdn.example/init-1.mp4", "video/mp4"));
        assertNull(MediaDiscoveryPolicy.mimeType("https://cdn.example/segment-12.m4s", "video/mp4"));
        assertNull(MediaDiscoveryPolicy.mimeType("https://cdn.example/player.js?format=mp4", "text/javascript"));
    }
    @Test public void preservesDashHlsAndExtensionlessManifestDetection() {
        assertEquals("application/dash+xml", MediaDiscoveryPolicy.mimeType("https://cdn.example/index.mpd?token=123", "video/mp4"));
        assertEquals("application/vnd.apple.mpegurl", MediaDiscoveryPolicy.mimeType("https://cdn.example/master.m3u8", null));
        assertEquals("application/dash+xml", MediaDiscoveryPolicy.mimeType("https://cdn.example/manifest?id=123", "application/dash+xml"));
        assertEquals("video/mp4", MediaDiscoveryPolicy.mimeType("https://cdn.example/movie.mp4", null));
    }
    @Test public void wrapsBothVideasyDomainsOnly() {
        assertTrue(MediaDiscoveryPolicy.requiresEmbed("https://player.videasy.net/tv/125988/1/6"));
        assertTrue(MediaDiscoveryPolicy.requiresEmbed("https://player.videasy.to/movie/550"));
        assertFalse(MediaDiscoveryPolicy.requiresEmbed("https://videasy.to.example/movie/550"));
        assertFalse(MediaDiscoveryPolicy.requiresEmbed("https://vidlink.pro/movie/550"));
    }
}
