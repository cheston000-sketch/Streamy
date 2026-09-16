package org.streamy.app;

import java.net.URI;
import java.util.Locale;

/** Only network media belongs in ExoPlayer; blobs remain owned by the WebView. */
final class MediaDiscoveryPolicy {
    static boolean requiresEmbed(String url) {
        try {
            String host = new URI(url).getHost();
            return host != null && (host.equals("videasy.net") || host.endsWith(".videasy.net")
                || host.equals("videasy.to") || host.endsWith(".videasy.to"));
        } catch (Exception ignored) {
            return false;
        }
    }

    static String mimeType(String url, String reportedType) {
        try {
            URI uri = new URI(url);
            if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                || uri.getHost() == null) return null;
            String path = uri.getPath() == null ? "" : uri.getPath().toLowerCase(Locale.ROOT);
            String type = reportedType == null ? "" : reportedType.toLowerCase(Locale.ROOT);
            if (path.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
            if (path.endsWith(".mpd")) return "application/dash+xml";
            // DASH/HLS initialization and media fragments are not standalone movies.
            String name = path.substring(path.lastIndexOf('/') + 1);
            if (path.endsWith(".m4s") || path.endsWith(".ts")
                || name.matches("(?:init|seg(?:ment)?|chunk|frag(?:ment)?)[-_.0-9].*")) return null;
            if (type.contains("mpegurl")) return "application/vnd.apple.mpegurl";
            if (type.contains("dash+xml")) return "application/dash+xml";
            if (path.endsWith(".mp4") || type.startsWith("video/mp4")) return "video/mp4";
            if (path.endsWith(".mkv") || type.contains("matroska")) return "video/x-matroska";
        } catch (Exception ignored) {
            return null;
        }
        return null;
    }
}
