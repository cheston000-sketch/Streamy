package org.streamy.app;

import static org.junit.Assert.assertEquals;

import androidx.media3.common.C;
import java.util.Locale;
import org.junit.Test;

public class AudioTrackLabelerTest {
    @Test
    public void buildsLanguageAndStereoLabel() {
        assertEquals("German | Stereo", AudioTrackLabeler.buildLabel("", "de", 2, 0, Locale.US));
    }

    @Test
    public void keepsProviderLabelAndAddsLanguage() {
        assertEquals("Original | English | 5.1 Surround", AudioTrackLabeler.buildLabel("Original", "en", 6, 0, Locale.US));
    }

    @Test
    public void identifiesCommentaryTracks() {
        assertEquals(
            "English | Commentary | Stereo",
            AudioTrackLabeler.buildLabel("", "en", 2, C.ROLE_FLAG_COMMENTARY, Locale.US)
        );
    }

    @Test
    public void fallsBackWhenMetadataIsMissing() {
        assertEquals("Audio Track", AudioTrackLabeler.buildLabel(null, "und", 0, 0, Locale.US));
    }
}
