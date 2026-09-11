package org.streamy.app;

import static org.junit.Assert.assertEquals;

import androidx.media3.common.MimeTypes;
import org.junit.Test;

public class PlayerMimeTypeTest {
    @Test
    public void dashUrlOverridesIncorrectMp4Report() {
        assertEquals(
            MimeTypes.APPLICATION_MPD,
            PlayerActivity.normalizeMimeType(
                "video/mp4",
                "https://cdn.example/video/index_web.mpd?token=abc"
            )
        );
    }

    @Test
    public void recognizesReportedDashMimeTypeWithoutExtension() {
        assertEquals(
            MimeTypes.APPLICATION_MPD,
            PlayerActivity.normalizeMimeType("application/dash+xml", "https://cdn.example/manifest?id=123")
        );
    }

    @Test
    public void keepsHlsAndMp4Behavior() {
        assertEquals(
            MimeTypes.APPLICATION_M3U8,
            PlayerActivity.normalizeMimeType("video/mp4", "https://cdn.example/master.m3u8?token=abc")
        );
        assertEquals(
            MimeTypes.VIDEO_MP4,
            PlayerActivity.normalizeMimeType(null, "https://cdn.example/video.mp4")
        );
    }
}
