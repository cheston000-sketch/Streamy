package org.streamy.app;

import androidx.media3.common.C;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

final class AudioTrackLabeler {
    private AudioTrackLabeler() {}

    static String buildLabel(String trackLabel, String language, int channelCount, int roleFlags, Locale displayLocale) {
        List<String> parts = new ArrayList<>();
        String cleanLabel = clean(trackLabel);
        String languageName = getLanguageName(language, displayLocale);

        if (!cleanLabel.isEmpty()) {
            parts.add(cleanLabel);
        }
        if (!languageName.isEmpty() && !containsIgnoreCase(cleanLabel, languageName)) {
            parts.add(languageName);
        }
        if (parts.isEmpty()) {
            parts.add("Audio Track");
        }

        addRole(parts, cleanLabel, roleFlags, C.ROLE_FLAG_COMMENTARY, "Commentary");
        addRole(parts, cleanLabel, roleFlags, C.ROLE_FLAG_DESCRIBES_VIDEO, "Audio Description");
        addRole(parts, cleanLabel, roleFlags, C.ROLE_FLAG_DUB, "Dubbed");

        String channelLabel = getChannelLabel(channelCount);
        if (!channelLabel.isEmpty()) {
            parts.add(channelLabel);
        }
        return String.join(" | ", parts);
    }

    static String getPrimaryName(String trackLabel, String language, Locale displayLocale) {
        String cleanLabel = clean(trackLabel);
        if (!cleanLabel.isEmpty()) {
            return cleanLabel;
        }
        String languageName = getLanguageName(language, displayLocale);
        return languageName.isEmpty() ? "Audio" : languageName;
    }

    static String getLanguageName(String language, Locale displayLocale) {
        String cleanLanguage = clean(language);
        if (cleanLanguage.isEmpty() || "und".equalsIgnoreCase(cleanLanguage) || "zxx".equalsIgnoreCase(cleanLanguage)) {
            return "";
        }

        Locale locale = Locale.forLanguageTag(cleanLanguage.replace('_', '-'));
        if (locale.getLanguage().isEmpty()) {
            return cleanLanguage.toUpperCase(displayLocale);
        }
        String displayName = locale.getDisplayName(displayLocale);
        return displayName.isEmpty() ? cleanLanguage.toUpperCase(displayLocale) : capitalize(displayName, displayLocale);
    }

    private static String getChannelLabel(int channelCount) {
        if (channelCount == 1) return "Mono";
        if (channelCount == 2) return "Stereo";
        if (channelCount == 6) return "5.1 Surround";
        if (channelCount == 8) return "7.1 Surround";
        return channelCount > 0 ? channelCount + " Channels" : "";
    }

    private static void addRole(List<String> parts, String trackLabel, int roleFlags, int roleFlag, String roleName) {
        if ((roleFlags & roleFlag) != 0 && !containsIgnoreCase(trackLabel, roleName)) {
            parts.add(roleName);
        }
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean containsIgnoreCase(String value, String search) {
        return !value.isEmpty() && value.toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT));
    }

    private static String capitalize(String value, Locale locale) {
        if (value.isEmpty()) return value;
        return value.substring(0, 1).toUpperCase(locale) + value.substring(1);
    }
}
