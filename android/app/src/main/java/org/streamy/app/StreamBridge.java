package org.streamy.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.webkit.JavascriptInterface;

/**
 * StreamBridge — JavaScript interface injected into the WebView as "StreamyPlayer".
 *
 * In player.js, call:
 *   window.StreamyPlayer.playStream(url, mimeType, title)
 *   window.StreamyPlayer.isNative() → true
 */
public class StreamBridge {

    private static final String TAG = "StreamBridge";
    private static final String PLAYBACK_PREFS = "streamy_playback";
    private final Context context;

    public StreamBridge(Context context) {
        this.context = context;
    }

    /** Returns true so player.js knows we're running inside the native app. */
    @JavascriptInterface
    public boolean isNative() {
        return true;
    }

    /** Forces Fire OS to present the first completed WebView frame. */
    @JavascriptInterface
    public void appReady() {
        if (context instanceof MainActivity) {
            ((MainActivity) context).onWebAppReady();
        }
    }

    /**
     * Called by player.js to play a direct stream URL in the app's native player.
     *
     * Fire TV playback regressed repeatedly when this path launched an external
     * chooser or relied on embedded WebView-hosted players. Keep direct streams
     * on PlayerActivity so we preserve the working native video surface.
     *
     * @param url      The stream URL (HLS .m3u8 or direct .mp4)
     * @param mimeType Either "application/x-mpegURL" for HLS or "video/mp4"
     * @param title    The movie/show title (displayed in the player)
     */
    @JavascriptInterface
    public void playStream(String url, String mimeType, String title, String mediaKey, long startPositionMs) {
        Log.i(TAG, "playStream mediaKey=" + mediaKey + " startPositionMs=" + startPositionMs + " mimeType=" + mimeType);
        Intent intent = new Intent(context, PlayerActivity.class);
        intent.putExtra("url", url);
        intent.putExtra("mimeType", mimeType);
        intent.putExtra("title", title);
        intent.putExtra("mediaKey", mediaKey);
        intent.putExtra("startPositionMs", startPositionMs);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    @JavascriptInterface
    public void playStream(String url, String mimeType, String title) {
        playStream(url, mimeType, title, "", 0L);
    }

    @JavascriptInterface
    public void playStreamWithProgress(String url, String mimeType, String title, String mediaKey, String startPositionMs) {
        playStreamWithProgress(url, mimeType, title, mediaKey, startPositionMs, "", "-1", "0", "0", "true");
    }

    @JavascriptInterface
    public void playStreamWithProgress(String url, String mimeType, String title, String mediaKey, String startPositionMs, String sourceJson, String sourceIndex, String nextSeason, String nextEpisode) {
        playStreamWithProgress(url, mimeType, title, mediaKey, startPositionMs, sourceJson, sourceIndex, nextSeason, nextEpisode, "true");
    }

    @JavascriptInterface
    public void playStreamWithHeaders(String url, String mimeType, String title, String mediaKey, String startPositionMs, String referer, String origin, String cookie, String sourceJson, String sourceIndex, String nextSeason, String nextEpisode) {
        playStreamWithHeaders(url, mimeType, title, mediaKey, startPositionMs, referer, origin, cookie, sourceJson, sourceIndex, nextSeason, nextEpisode, "true");
    }

    @JavascriptInterface
    public void playStreamWithProgress(String url, String mimeType, String title, String mediaKey, String startPositionMs, String sourceJson, String sourceIndex, String nextSeason, String nextEpisode, String autoplayNextEpisode) {
        playStreamWithHeaders(url, mimeType, title, mediaKey, startPositionMs, "", "", "", sourceJson, sourceIndex, nextSeason, nextEpisode, autoplayNextEpisode);
    }

    /**
     * Full playback entry point with a unique JavaScript name.
     *
     * WebView JavaScript interfaces do not reliably dispatch overloaded Java
     * methods by argument count on every Fire OS version. Keep this method
     * unique so episode context cannot be dropped by a shorter overload.
     */
    @JavascriptInterface
    public void playStreamWithContext(String url, String mimeType, String title, String mediaKey, String startPositionMs, String referer, String origin, String cookie, String sourceJson, String sourceIndex, String nextSeason, String nextEpisode, String autoplayNextEpisode) {
        Log.i(TAG, "playStreamWithContext next=S" + nextSeason + "E" + nextEpisode + " autoplayNext=" + autoplayNextEpisode);
        playStreamWithHeaders(url, mimeType, title, mediaKey, startPositionMs, referer, origin, cookie, sourceJson, sourceIndex, nextSeason, nextEpisode, autoplayNextEpisode);
    }

    @JavascriptInterface
    public void playStreamWithMetadata(String url, String mimeType, String title, String mediaKey, String startPositionMs, String referer, String origin, String cookie, String sourceJson, String sourceIndex, String nextSeason, String nextEpisode, String autoplayNextEpisode, String playbackMetadataJson) {
        Log.i(TAG, "playStreamWithMetadata next=S" + nextSeason + "E" + nextEpisode + " hasMetadata=" + (playbackMetadataJson != null && !playbackMetadataJson.isEmpty()));
        launchNativePlayer(url, mimeType, title, mediaKey, startPositionMs, referer, origin, cookie, sourceJson, sourceIndex, nextSeason, nextEpisode, autoplayNextEpisode, playbackMetadataJson);
    }

    @JavascriptInterface
    public void playStreamWithHeaders(String url, String mimeType, String title, String mediaKey, String startPositionMs, String referer, String origin, String cookie, String sourceJson, String sourceIndex, String nextSeason, String nextEpisode, String autoplayNextEpisode) {
        launchNativePlayer(url, mimeType, title, mediaKey, startPositionMs, referer, origin, cookie, sourceJson, sourceIndex, nextSeason, nextEpisode, autoplayNextEpisode, "");
    }

    private void launchNativePlayer(String url, String mimeType, String title, String mediaKey, String startPositionMs, String referer, String origin, String cookie, String sourceJson, String sourceIndex, String nextSeason, String nextEpisode, String autoplayNextEpisode, String playbackMetadataJson) {
        long parsedStartPositionMs = 0L;
        try {
            parsedStartPositionMs = Long.parseLong(startPositionMs == null ? "0" : startPositionMs);
        } catch (NumberFormatException ignored) {
            parsedStartPositionMs = 0L;
        }
        Log.i(TAG, "playStreamWithHeaders mediaKey=" + mediaKey + " raw=" + startPositionMs + " parsed=" + parsedStartPositionMs + " hasReferer=" + (referer != null && !referer.isEmpty()) + " next=S" + nextSeason + "E" + nextEpisode + " autoplayNext=" + autoplayNextEpisode);
        Intent intent = new Intent(context, PlayerActivity.class);
        intent.putExtra("url", url);
        intent.putExtra("mimeType", mimeType);
        intent.putExtra("title", title);
        intent.putExtra("mediaKey", mediaKey);
        intent.putExtra("startPositionMs", parsedStartPositionMs);
        intent.putExtra("referer", referer);
        intent.putExtra("origin", origin);
        intent.putExtra("cookie", cookie);
        intent.putExtra("sourceJson", sourceJson);
        intent.putExtra("sourceIndex", parseInt(sourceIndex, -1));
        intent.putExtra("nextSeason", parseInt(nextSeason, 0));
        intent.putExtra("nextEpisode", parseInt(nextEpisode, 0));
        intent.putExtra("autoplayNextEpisode", parseBoolean(autoplayNextEpisode, true));
        intent.putExtra("playbackMetadataJson", playbackMetadataJson == null ? "" : playbackMetadataJson);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    @JavascriptInterface
    public long getPlaybackProgress(String mediaKey) {
        if (mediaKey == null || mediaKey.isEmpty()) {
            return 0L;
        }
        long value = context.getSharedPreferences(PLAYBACK_PREFS, Context.MODE_PRIVATE)
            .getLong(mediaKey, 0L);
        Log.i(TAG, "getPlaybackProgress mediaKey=" + mediaKey + " value=" + value);
        return value;
    }

    @JavascriptInterface
    public void clearPlaybackProgress(String mediaKey) {
        if (mediaKey == null || mediaKey.isEmpty()) {
            return;
        }
        Log.i(TAG, "clearPlaybackProgress mediaKey=" + mediaKey);
        context.getSharedPreferences(PLAYBACK_PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(mediaKey)
            .apply();
    }

    @JavascriptInterface
    public void downloadUpdate(String url) {
        if (url == null || url.isEmpty()) {
            return;
        }
        Log.i(TAG, "downloadUpdate url=" + url);
        if (context instanceof MainActivity) {
            ((MainActivity) context).downloadAndInstallUpdate(url, 0L);
        }
    }

    @JavascriptInterface
    public void downloadRequiredUpdate(String url, String expectedVersion) {
        long parsedVersion = 0L;
        try {
            parsedVersion = Long.parseLong(expectedVersion == null ? "0" : expectedVersion);
        } catch (NumberFormatException ignored) {
            parsedVersion = 0L;
        }
        Log.i(TAG, "downloadRequiredUpdate expectedVersion=" + parsedVersion + " url=" + url);
        if (context instanceof MainActivity) {
            ((MainActivity) context).downloadAndInstallUpdate(url, parsedVersion);
        }
    }

    @JavascriptInterface
    public void exitApp() {
        if (context instanceof MainActivity) {
            ((MainActivity) context).exitForRequiredUpdate();
        }
    }

    @JavascriptInterface
    public void openWebPlayer(String url, String title, String tmdbId) {
        openWebPlayer(url, title, tmdbId, "", "0", "0", "0");
    }

    @JavascriptInterface
    public void openWebPlayer(String url, String title, String tmdbId, String mediaKey, String startPositionMs) {
        openWebPlayer(url, title, tmdbId, mediaKey, startPositionMs, "0", "0");
    }

    @JavascriptInterface
    public void openWebPlayer(String url, String title, String tmdbId, String mediaKey, String startPositionMs, String nextSeason, String nextEpisode) {
        openWebPlayer(url, title, tmdbId, mediaKey, startPositionMs, nextSeason, nextEpisode, "", "-1");
    }

    @JavascriptInterface
    public void openWebPlayer(String url, String title, String tmdbId, String mediaKey, String startPositionMs, String nextSeason, String nextEpisode, String sourceJson, String sourceIndex) {
        openWebPlayer(url, title, tmdbId, mediaKey, startPositionMs, nextSeason, nextEpisode, sourceJson, sourceIndex, "true");
    }

    @JavascriptInterface
    public void openWebPlayer(String url, String title, String tmdbId, String mediaKey, String startPositionMs, String nextSeason, String nextEpisode, String sourceJson, String sourceIndex, String autoplayNextEpisode) {
        launchWebPlayer(url, title, tmdbId, mediaKey, startPositionMs, nextSeason, nextEpisode, sourceJson, sourceIndex, autoplayNextEpisode, "");
    }

    private void launchWebPlayer(String url, String title, String tmdbId, String mediaKey, String startPositionMs, String nextSeason, String nextEpisode, String sourceJson, String sourceIndex, String autoplayNextEpisode, String playbackMetadataJson) {
        // WebPlayerActivity exists only as a bridge/fallback path so it can
        // discover real stream requests and hand them off to PlayerActivity.
        Intent intent = new Intent(context, WebPlayerActivity.class);
        intent.putExtra("url", url);
        intent.putExtra("title", title);
        intent.putExtra("tmdbId", tmdbId);
        intent.putExtra("mediaKey", mediaKey);
        intent.putExtra("startPositionMs", startPositionMs);
        intent.putExtra("nextSeason", nextSeason);
        intent.putExtra("nextEpisode", nextEpisode);
        intent.putExtra("autoplayNextEpisode", parseBoolean(autoplayNextEpisode, true));
        intent.putExtra("sourceJson", sourceJson);
        intent.putExtra("sourceIndex", parseInt(sourceIndex, -1));
        intent.putExtra("playbackMetadataJson", playbackMetadataJson == null ? "" : playbackMetadataJson);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    /** See {@link #playStreamWithContext}; this avoids overloaded bridge dispatch. */
    @JavascriptInterface
    public void openWebPlayerWithContext(String url, String title, String tmdbId, String mediaKey, String startPositionMs, String nextSeason, String nextEpisode, String sourceJson, String sourceIndex, String autoplayNextEpisode) {
        Log.i(TAG, "openWebPlayerWithContext mediaKey=" + mediaKey + " next=S" + nextSeason + "E" + nextEpisode + " autoplayNext=" + autoplayNextEpisode);
        openWebPlayer(url, title, tmdbId, mediaKey, startPositionMs, nextSeason, nextEpisode, sourceJson, sourceIndex, autoplayNextEpisode);
    }

    @JavascriptInterface
    public void openWebPlayerWithMetadata(String url, String title, String tmdbId, String mediaKey, String startPositionMs, String nextSeason, String nextEpisode, String sourceJson, String sourceIndex, String autoplayNextEpisode, String playbackMetadataJson) {
        Log.i(TAG, "openWebPlayerWithMetadata mediaKey=" + mediaKey + " next=S" + nextSeason + "E" + nextEpisode + " hasMetadata=" + (playbackMetadataJson != null && !playbackMetadataJson.isEmpty()));
        launchWebPlayer(url, title, tmdbId, mediaKey, startPositionMs, nextSeason, nextEpisode, sourceJson, sourceIndex, autoplayNextEpisode, playbackMetadataJson);
    }

    private int parseInt(String raw, int fallback) {
        try {
            return Integer.parseInt(raw == null ? "" : raw);
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private boolean parseBoolean(String raw, boolean fallback) {
        if (raw == null || raw.isEmpty()) {
            return fallback;
        }
        return Boolean.parseBoolean(raw);
    }
}
