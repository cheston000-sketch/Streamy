package org.streamy.app;

import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.util.Log;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.ui.PlayerView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends AppCompatActivity {
    private static final String TAG = "PlayerActivity";
    private static final String PLAYBACK_PREFS = "streamy_playback";
    private static final String PREF_AUDIO_LANGUAGE = "preferred_audio_language";
    private static final long NEXT_EPISODE_PROMPT_THRESHOLD_MS = 120_000L;

    private static final class EpisodeMarker {
        final String type;
        final long startMs;
        final long endMs;
        final String provider;
        boolean dismissed;

        EpisodeMarker(String type, long startMs, long endMs, String provider) {
            this.type = type;
            this.startMs = startMs;
            this.endMs = endMs;
            this.provider = provider;
        }
    }

    private ExoPlayer player;
    private PlayerView playerView;
    private SharedPreferences playbackPrefs;
    private String mediaKey;
    private long pendingStartPositionMs;
    private boolean resumeSeekApplied;
    private LinearLayout nextEpisodePrompt;
    private TextView nextEpisodeTitle;
    private Button nextEpisodeButton;
    private Button nextEpisodeCancelButton;
    private LinearLayout segmentSkipPrompt;
    private TextView segmentSkipTitle;
    private TextView segmentSkipDetail;
    private Button segmentSkipButton;
    private Button segmentSkipCancelButton;
    private View audioTrackScrim;
    private LinearLayout audioTrackPanel;
    private LinearLayout audioTrackList;
    private TextView audioTrackStatus;
    private Button audioTrackButton;
    private Button audioTrackCloseButton;
    private boolean playerControlsVisible;
    private boolean hasAudioTracks;
    private int nextSeason;
    private int nextEpisode;
    private boolean autoplayNextEpisode;
    private boolean nextPromptShown;
    private boolean nextPromptDismissed;
    private boolean nextEpisodeLaunchRequested;
    private boolean segmentSkipPromptShown;
    private EpisodeMarker recapMarker;
    private EpisodeMarker introMarker;
    private EpisodeMarker activeSkipMarker;
    private String sourceJson;
    private String playbackMetadataJson;
    private int sourceIndex;
    private boolean failedOverAfterError;
    private long lastProgressPersistElapsedMs;
    private final Runnable nextPromptChecker = new Runnable() {
        @Override
        public void run() {
            updateSegmentSkipPrompt();
            updateNextEpisodePrompt();
            long now = SystemClock.elapsedRealtime();
            if (player != null && player.isPlaying() && now - lastProgressPersistElapsedMs >= 10_000L) {
                persistPlaybackProgress();
                lastProgressPersistElapsedMs = now;
            }
            if (playerView != null) {
                playerView.postDelayed(this, 1000L);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_player);

        playerView = findViewById(R.id.native_player_view);
        nextEpisodePrompt = findViewById(R.id.native_next_episode_prompt);
        nextEpisodeTitle = findViewById(R.id.native_next_episode_title);
        nextEpisodeButton = findViewById(R.id.native_next_episode_button);
        nextEpisodeCancelButton = findViewById(R.id.native_next_episode_cancel);
        segmentSkipPrompt = findViewById(R.id.native_segment_skip_prompt);
        segmentSkipTitle = findViewById(R.id.native_segment_skip_title);
        segmentSkipDetail = findViewById(R.id.native_segment_skip_detail);
        segmentSkipButton = findViewById(R.id.native_segment_skip_button);
        segmentSkipCancelButton = findViewById(R.id.native_segment_skip_cancel);
        audioTrackScrim = findViewById(R.id.native_audio_track_scrim);
        audioTrackPanel = findViewById(R.id.native_audio_track_panel);
        audioTrackList = findViewById(R.id.native_audio_track_list);
        audioTrackStatus = findViewById(R.id.native_audio_track_status);
        audioTrackButton = findViewById(R.id.native_audio_track_button);
        audioTrackCloseButton = findViewById(R.id.native_audio_track_close);
        playbackPrefs = getSharedPreferences(PLAYBACK_PREFS, MODE_PRIVATE);
        playerView.setKeepScreenOn(true);
        setupAudioTrackSelector();
        enterImmersiveMode();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (isSegmentSkipPromptVisible()) {
                    dismissSegmentSkipPrompt();
                    return;
                }
                if (isAudioTrackPanelVisible()) {
                    closeAudioTrackPanel();
                    return;
                }
                persistPlaybackProgress();
                finish();
            }
        });

        String url = getIntent().getStringExtra("url");
        String title = getIntent().getStringExtra("title");
        String mimeType = normalizeMimeType(getIntent().getStringExtra("mimeType"), url);
        String referer = getIntent().getStringExtra("referer");
        String origin = getIntent().getStringExtra("origin");
        String cookie = getIntent().getStringExtra("cookie");
        mediaKey = getIntent().getStringExtra("mediaKey");
        pendingStartPositionMs = Math.max(0L, getIntent().getLongExtra("startPositionMs", 0L));
        nextSeason = getIntent().getIntExtra("nextSeason", 0);
        nextEpisode = getIntent().getIntExtra("nextEpisode", 0);
        autoplayNextEpisode = getIntent().getBooleanExtra("autoplayNextEpisode", true);
        sourceJson = getIntent().getStringExtra("sourceJson");
        playbackMetadataJson = getIntent().getStringExtra("playbackMetadataJson");
        parseEpisodeMarkers(playbackMetadataJson);
        sourceIndex = getIntent().getIntExtra("sourceIndex", -1);
        resumeSeekApplied = false;
        failedOverAfterError = false;
        Log.i(TAG, "onCreate mediaKey=" + mediaKey + " pendingStartPositionMs=" + pendingStartPositionMs + " next=S" + nextSeason + "E" + nextEpisode + " autoplayNext=" + autoplayNextEpisode + " title=" + title);

        if (title != null && !title.isEmpty()) {
            setTitle(title);
        }

        if (url == null || url.isEmpty()) {
            finish();
            return;
        }

        setupNextEpisodePrompt();
        setupSegmentSkipPrompt();

        Map<String, String> requestHeaders = new HashMap<>();
        requestHeaders.put("Referer", getRefererValue(referer, url));
        requestHeaders.put("Origin", getOriginValue(origin, referer, url));
        requestHeaders.put("Accept", "*/*");
        if (cookie != null && !cookie.isEmpty()) {
            requestHeaders.put("Cookie", cookie);
        }

        // Fire TV-compatible native playback path. The referrer/origin values
        // are intentionally inherited from the WebView request because several
        // hosts reject the same stream URL when these headers are missing.
        DefaultHttpDataSource.Factory dataSourceFactory = new DefaultHttpDataSource.Factory()
            .setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(requestHeaders);

        MediaItem mediaItem = new MediaItem.Builder()
            .setUri(Uri.parse(url))
            .setMimeType(mimeType)
            .build();

        MediaSource mediaSource;
        if (MimeTypes.APPLICATION_M3U8.equals(mimeType)) {
            mediaSource = new HlsMediaSource.Factory(dataSourceFactory).createMediaSource(mediaItem);
        } else {
            mediaSource = new ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(mediaItem);
        }

        player = new ExoPlayer.Builder(this).build();
        applySavedAudioLanguagePreference();
        playerView.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onTracksChanged(Tracks tracks) {
                refreshAudioTrackState(tracks);
            }

            @Override
            public void onTrackSelectionParametersChanged(TrackSelectionParameters parameters) {
                refreshAudioTrackState(player.getCurrentTracks());
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (!resumeSeekApplied && playbackState == Player.STATE_READY && pendingStartPositionMs >= PlaybackProgressPolicy.RESUME_MIN_POSITION_MS) {
                    Log.i(TAG, "Applying resume seek mediaKey=" + mediaKey + " positionMs=" + pendingStartPositionMs);
                    player.seekTo(pendingStartPositionMs);
                    resumeSeekApplied = true;
                }
                if (playbackState == Player.STATE_READY) {
                    updateSegmentSkipPrompt();
                }
                if (playbackState == Player.STATE_ENDED) {
                    Log.i(TAG, "Playback ended; clearing saved progress for mediaKey=" + mediaKey);
                    clearSavedProgress();
                    if (NextEpisodePolicy.shouldAutoplay(autoplayNextEpisode, nextPromptDismissed, nextSeason, nextEpisode)) {
                        Log.i(TAG, "Playback ended; auto-playing S" + nextSeason + "E" + nextEpisode);
                        launchNextEpisode();
                    } else {
                        Log.w(TAG, "Playback ended without autoplay: enabled=" + autoplayNextEpisode + " dismissed=" + nextPromptDismissed + " next=S" + nextSeason + "E" + nextEpisode);
                        hideNextEpisodePrompt();
                    }
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                Log.e(TAG, "Playback failed mimeType=" + mimeType + " referer=" + referer + " origin=" + origin + " hasCookie=" + (cookie != null && !cookie.isEmpty()), error);
                tryLaunchNextSource("Native player error: " + error.getErrorCodeName());
            }
        });
        player.setMediaSource(mediaSource);
        player.setPlayWhenReady(true);
        player.setVolume(1f);
        player.prepare();
    }

    private JSONObject getSourceAt(int index) {
        if (sourceJson == null || sourceJson.isEmpty() || index < 0) {
            return null;
        }

        try {
            JSONArray sources = new JSONArray(sourceJson);
            if (index >= sources.length()) {
                return null;
            }
            return sources.getJSONObject(index);
        } catch (Exception error) {
            Log.w(TAG, "Unable to parse source list for failover", error);
            return null;
        }
    }

    private void tryLaunchNextSource(String reason) {
        if (failedOverAfterError) {
            return;
        }
        failedOverAfterError = true;

        JSONObject nextSource = getSourceAt(sourceIndex + 1);
        if (nextSource == null) {
            Log.w(TAG, "No next source available after failure: " + reason);
            return;
        }

        playerView.postDelayed(() -> launchSource(nextSource, sourceIndex + 1, reason), 1000L);
    }

    private void launchSource(JSONObject source, int index, String reason) {
        try {
            String url = source.optString("url", "");
            String type = source.optString("type", "iframe");
            String server = source.optString("server", "Backup Source");
            String referer = source.optString("referer", "");
            String origin = source.optString("origin", "");
            String cookie = source.optString("cookie", "");
            if (url.isEmpty()) {
                Log.w(TAG, "Next source is missing URL after failure: " + reason);
                return;
            }

            Log.i(TAG, "Failing over to source " + index + " (" + server + ") because " + reason);
            Intent intent;
            if ("iframe".equalsIgnoreCase(type)) {
                intent = new Intent(this, WebPlayerActivity.class);
            } else {
                intent = new Intent(this, PlayerActivity.class);
                String nextMimeType = "hls".equalsIgnoreCase(type)
                    ? MimeTypes.APPLICATION_M3U8
                    : normalizeMimeType(type, url);
                intent.putExtra("mimeType", nextMimeType);
            }
            intent.putExtra("url", url);
            intent.putExtra("title", getTitle() != null ? getTitle().toString() + " | " + server : server);
            intent.putExtra("referer", referer);
            intent.putExtra("origin", origin);
            intent.putExtra("cookie", cookie);
            intent.putExtra("mediaKey", mediaKey);
            long currentPositionMs = PlaybackProgressPolicy.resolveFailoverPosition(
                pendingStartPositionMs,
                player == null ? 0L : player.getCurrentPosition()
            );
            intent.putExtra("startPositionMs", currentPositionMs);
            intent.putExtra("nextSeason", nextSeason);
            intent.putExtra("nextEpisode", nextEpisode);
            intent.putExtra("autoplayNextEpisode", autoplayNextEpisode);
            intent.putExtra("sourceJson", sourceJson);
            intent.putExtra("sourceIndex", index);
            intent.putExtra("playbackMetadataJson", playbackMetadataJson);
            startActivity(intent);
            finish();
        } catch (Exception error) {
            Log.e(TAG, "Failed to launch next source", error);
        }
    }

    private String normalizeMimeType(String mimeType, String url) {
        if (mimeType != null && !mimeType.isEmpty()) {
            if ("application/x-mpegURL".equalsIgnoreCase(mimeType) || "application/vnd.apple.mpegurl".equalsIgnoreCase(mimeType)) {
                return MimeTypes.APPLICATION_M3U8;
            }
            return mimeType;
        }

        String lower = url == null ? "" : url.toLowerCase(Locale.ROOT);
        if (lower.contains(".m3u8")) {
            return MimeTypes.APPLICATION_M3U8;
        }
        if (lower.contains(".mp4")) {
            return MimeTypes.VIDEO_MP4;
        }
        return MimeTypes.APPLICATION_MP4;
    }

    private String getOrigin(String rawUrl) {
        Uri uri = Uri.parse(rawUrl);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null) {
            return "";
        }
        int port = uri.getPort();
        if (port > 0) {
            return scheme + "://" + host + ":" + port;
        }
        return scheme + "://" + host;
    }

    private String getRefererValue(String referer, String url) {
        if (referer != null && !referer.isEmpty()) {
            return referer;
        }
        return getOrigin(url) + "/";
    }

    private String getOriginValue(String origin, String referer, String url) {
        if (origin != null && !origin.isEmpty()) {
            return origin;
        }
        if (referer != null && !referer.isEmpty()) {
            return getOrigin(referer);
        }
        return getOrigin(url);
    }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    private void setupAudioTrackSelector() {
        playerControlsVisible = false;
        hasAudioTracks = false;
        audioTrackButton.setVisibility(View.GONE);
        audioTrackPanel.setVisibility(View.GONE);
        audioTrackScrim.setVisibility(View.GONE);

        configurePromptButton(audioTrackButton, false);
        audioTrackButton.setAllCaps(false);
        audioTrackButton.setOnClickListener(v -> showAudioTrackPanel());

        configurePromptButton(audioTrackCloseButton, false);
        audioTrackCloseButton.setOnClickListener(v -> closeAudioTrackPanel());
        audioTrackScrim.setOnClickListener(v -> closeAudioTrackPanel());

        playerView.setControllerShowTimeoutMs(7_000);
        playerView.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> {
            playerControlsVisible = visibility == View.VISIBLE;
            updateAudioTrackButtonVisibility();
        });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            int keyCode = event.getKeyCode();
            if (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK) {
                if (isAudioTrackPanelVisible()) {
                    closeAudioTrackPanel();
                } else {
                    showAudioTrackPanel();
                }
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void showAudioTrackPanel() {
        if (audioTrackPanel == null || audioTrackScrim == null) {
            return;
        }

        if (nextEpisodePrompt != null && nextEpisodePrompt.getVisibility() == View.VISIBLE) {
            nextPromptShown = false;
            hideNextEpisodePrompt();
        }
        if (isSegmentSkipPromptVisible()) {
            dismissSegmentSkipPrompt();
        }

        audioTrackScrim.setVisibility(View.VISIBLE);
        audioTrackPanel.setVisibility(View.VISIBLE);
        audioTrackScrim.bringToFront();
        audioTrackPanel.bringToFront();
        audioTrackButton.setVisibility(View.GONE);
        refreshAudioTrackOptions();
        enterImmersiveMode();
    }

    private void closeAudioTrackPanel() {
        if (audioTrackPanel == null || audioTrackScrim == null) {
            return;
        }

        audioTrackPanel.setVisibility(View.GONE);
        audioTrackScrim.setVisibility(View.GONE);
        playerView.showController();
        playerControlsVisible = true;
        updateAudioTrackButtonVisibility();
        audioTrackButton.post(() -> {
            if (audioTrackButton.getVisibility() == View.VISIBLE) {
                audioTrackButton.requestFocus();
            }
        });
    }

    private boolean isAudioTrackPanelVisible() {
        return audioTrackPanel != null && audioTrackPanel.getVisibility() == View.VISIBLE;
    }

    private void refreshAudioTrackState(Tracks tracks) {
        hasAudioTracks = countSupportedAudioTracks(tracks) > 0;
        updateCurrentAudioTrackLabel(tracks);
        if (isAudioTrackPanelVisible()) {
            refreshAudioTrackOptions();
        }
        updateAudioTrackButtonVisibility();
    }

    private void updateAudioTrackButtonVisibility() {
        if (audioTrackButton == null) {
            return;
        }
        boolean nextPromptVisible = nextEpisodePrompt != null && nextEpisodePrompt.getVisibility() == View.VISIBLE;
        boolean segmentPromptVisible = isSegmentSkipPromptVisible();
        boolean shouldShow = hasAudioTracks && playerControlsVisible && !isAudioTrackPanelVisible() && !nextPromptVisible && !segmentPromptVisible;
        audioTrackButton.setVisibility(shouldShow ? View.VISIBLE : View.GONE);
    }

    private void updateCurrentAudioTrackLabel(Tracks tracks) {
        if (audioTrackButton == null) {
            return;
        }

        String currentName = "Audio";
        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() != C.TRACK_TYPE_AUDIO) continue;
            for (int trackIndex = 0; trackIndex < group.length; trackIndex++) {
                if (!group.isTrackSelected(trackIndex)) continue;
                Format format = group.getTrackFormat(trackIndex);
                currentName = AudioTrackLabeler.getPrimaryName(format.label, format.language, Locale.getDefault());
                break;
            }
        }
        audioTrackButton.setText(getString(R.string.audio_button_format, currentName));
        audioTrackButton.setContentDescription(getString(R.string.audio_button_format, currentName));
    }

    private int countSupportedAudioTracks(Tracks tracks) {
        int count = 0;
        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() != C.TRACK_TYPE_AUDIO) continue;
            for (int trackIndex = 0; trackIndex < group.length; trackIndex++) {
                if (group.isTrackSupported(trackIndex)) count++;
            }
        }
        return count;
    }

    private void refreshAudioTrackOptions() {
        if (audioTrackList == null || audioTrackStatus == null) {
            return;
        }

        audioTrackList.removeAllViews();
        Tracks tracks = player == null ? Tracks.EMPTY : player.getCurrentTracks();
        TrackSelectionOverride activeOverride = getActiveAudioOverride();
        String preferredLanguage = normalizeAudioLanguage(playbackPrefs.getString(PREF_AUDIO_LANGUAGE, ""));
        boolean autoSelected = activeOverride == null && preferredLanguage.isEmpty();

        Button autoButton = createAudioTrackOptionButton(
            getString(R.string.audio_track_auto) + (autoSelected ? " " + getString(R.string.audio_track_selected_suffix) : ""),
            autoSelected
        );
        autoButton.setOnClickListener(v -> applyAutomaticAudioSelection());
        audioTrackList.addView(autoButton);
        Button focusTarget = autoSelected ? autoButton : null;

        int availableTrackCount = 0;
        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() != C.TRACK_TYPE_AUDIO) continue;
            for (int trackIndex = 0; trackIndex < group.length; trackIndex++) {
                if (!group.isTrackSupported(trackIndex)) continue;

                availableTrackCount++;
                Format format = group.getTrackFormat(trackIndex);
                boolean explicitlySelected = isOverrideTrack(activeOverride, group, trackIndex);
                boolean currentlyPlaying = group.isTrackSelected(trackIndex);
                boolean preferredLanguageSelected = activeOverride == null
                    && currentlyPlaying
                    && audioLanguagesMatch(preferredLanguage, format.language);
                boolean selected = explicitlySelected || preferredLanguageSelected;
                String optionLabel = AudioTrackLabeler.buildLabel(
                    format.label,
                    format.language,
                    format.channelCount,
                    format.roleFlags,
                    Locale.getDefault()
                );
                if (selected) {
                    optionLabel += " " + getString(R.string.audio_track_selected_suffix);
                } else if (currentlyPlaying) {
                    optionLabel += " " + getString(R.string.audio_track_playing_suffix);
                }

                Button optionButton = createAudioTrackOptionButton(optionLabel, selected);
                int selectedTrackIndex = trackIndex;
                optionButton.setOnClickListener(v -> applyAudioTrack(group, selectedTrackIndex, format));
                audioTrackList.addView(optionButton);
                if (selected || (focusTarget == null && currentlyPlaying)) {
                    focusTarget = optionButton;
                }
            }
        }

        if (availableTrackCount == 0) {
            audioTrackStatus.setText(R.string.audio_tracks_loading);
        } else {
            audioTrackStatus.setText(getResources().getQuantityString(
                R.plurals.audio_tracks_available,
                availableTrackCount,
                availableTrackCount
            ));
        }

        Button target = focusTarget == null ? autoButton : focusTarget;
        audioTrackPanel.post(target::requestFocus);
    }

    private TrackSelectionOverride getActiveAudioOverride() {
        if (player == null) return null;
        for (TrackSelectionOverride override : player.getTrackSelectionParameters().overrides.values()) {
            if (override.getType() == C.TRACK_TYPE_AUDIO) return override;
        }
        return null;
    }

    private boolean isOverrideTrack(TrackSelectionOverride override, Tracks.Group group, int trackIndex) {
        return override != null
            && override.mediaTrackGroup.equals(group.getMediaTrackGroup())
            && override.trackIndices.contains(trackIndex);
    }

    private Button createAudioTrackOptionButton(String label, boolean selected) {
        Button button = new Button(this);
        LinearLayout.LayoutParams layoutParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        layoutParams.setMargins(0, 0, 0, dpToPx(8));
        button.setLayoutParams(layoutParams);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(18f);
        button.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        button.setFocusable(true);
        button.setMinHeight(dpToPx(58));
        button.setPadding(dpToPx(20), dpToPx(12), dpToPx(20), dpToPx(12));

        int normalBg = Color.parseColor(selected ? "#E50914" : "#25282D");
        int focusedBg = Color.WHITE;
        applyAudioTrackOptionStyle(button, false, selected, normalBg, focusedBg);
        button.setOnFocusChangeListener((view, hasFocus) ->
            applyAudioTrackOptionStyle(button, hasFocus, selected, normalBg, focusedBg)
        );
        return button;
    }

    private void applyAudioTrackOptionStyle(Button button, boolean focused, boolean selected, int normalBg, int focusedBg) {
        button.setBackgroundTintList(ColorStateList.valueOf(focused ? focusedBg : normalBg));
        button.setTextColor(focused ? Color.BLACK : Color.WHITE);
        button.setAlpha(focused || selected ? 1f : 0.9f);
        button.setScaleX(focused ? 1.03f : 1f);
        button.setScaleY(focused ? 1.03f : 1f);
    }

    private void applyAudioTrack(Tracks.Group group, int trackIndex, Format format) {
        if (player == null) return;

        TrackSelectionParameters.Builder builder = player.getTrackSelectionParameters().buildUpon()
            .clearOverridesOfType(C.TRACK_TYPE_AUDIO)
            .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false);
        String language = normalizeAudioLanguage(format.language);
        if (language.isEmpty()) {
            builder.setPreferredAudioLanguages();
            playbackPrefs.edit().remove(PREF_AUDIO_LANGUAGE).apply();
        } else {
            builder.setPreferredAudioLanguage(language);
            playbackPrefs.edit().putString(PREF_AUDIO_LANGUAGE, language).apply();
        }
        builder.setOverrideForType(new TrackSelectionOverride(group.getMediaTrackGroup(), trackIndex));
        player.setTrackSelectionParameters(builder.build());

        String label = AudioTrackLabeler.buildLabel(
            format.label,
            format.language,
            format.channelCount,
            format.roleFlags,
            Locale.getDefault()
        );
        Log.i(TAG, "Audio track selected: " + label + " language=" + language);
        Toast.makeText(this, getString(R.string.audio_track_changed, label), Toast.LENGTH_SHORT).show();
        closeAudioTrackPanel();
    }

    private void applyAutomaticAudioSelection() {
        if (player == null) return;

        player.setTrackSelectionParameters(
            player.getTrackSelectionParameters().buildUpon()
                .clearOverridesOfType(C.TRACK_TYPE_AUDIO)
                .setPreferredAudioLanguages()
                .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
                .build()
        );
        playbackPrefs.edit().remove(PREF_AUDIO_LANGUAGE).apply();
        Log.i(TAG, "Audio track selection restored to Auto");
        Toast.makeText(this, R.string.audio_track_auto_enabled, Toast.LENGTH_SHORT).show();
        closeAudioTrackPanel();
    }

    private void applySavedAudioLanguagePreference() {
        if (player == null) return;
        String language = normalizeAudioLanguage(playbackPrefs.getString(PREF_AUDIO_LANGUAGE, ""));
        if (language.isEmpty()) return;

        player.setTrackSelectionParameters(
            player.getTrackSelectionParameters().buildUpon()
                .setPreferredAudioLanguage(language)
                .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
                .build()
        );
        Log.i(TAG, "Applying saved audio language preference: " + language);
    }

    private String normalizeAudioLanguage(String language) {
        if (language == null) return "";
        String cleanLanguage = language.trim();
        if (cleanLanguage.isEmpty() || "und".equalsIgnoreCase(cleanLanguage) || "zxx".equalsIgnoreCase(cleanLanguage)) {
            return "";
        }
        return cleanLanguage;
    }

    private boolean audioLanguagesMatch(String preferredLanguage, String trackLanguage) {
        String preferred = normalizeAudioLanguage(preferredLanguage).toLowerCase(Locale.ROOT);
        String track = normalizeAudioLanguage(trackLanguage).toLowerCase(Locale.ROOT);
        if (preferred.isEmpty() || track.isEmpty()) return false;
        return preferred.equals(track)
            || preferred.startsWith(track + "-")
            || track.startsWith(preferred + "-");
    }

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
        if (player != null) {
            player.play();
        }
        if (playerView != null) {
            playerView.removeCallbacks(nextPromptChecker);
            playerView.post(nextPromptChecker);
        }
    }

    @Override
    protected void onPause() {
        if (playerView != null) {
            playerView.removeCallbacks(nextPromptChecker);
        }
        if (player != null) {
            persistPlaybackProgress();
            player.pause();
        }
        super.onPause();
    }

    @Override
    protected void onStop() {
        persistPlaybackProgress();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        if (playerView != null) {
            playerView.removeCallbacks(nextPromptChecker);
        }
        persistPlaybackProgress();
        if (playerView != null) {
            playerView.setPlayer(null);
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }

    private void persistPlaybackProgress() {
        if (player == null || mediaKey == null || mediaKey.isEmpty()) {
            return;
        }

        long position = Math.max(0L, player.getCurrentPosition());
        long duration = player.getDuration();
        Log.i(TAG, "persistPlaybackProgress mediaKey=" + mediaKey + " position=" + position + " duration=" + duration);
        PlaybackProgressPolicy.Action action = PlaybackProgressPolicy.evaluate(position, duration);
        if (action == PlaybackProgressPolicy.Action.CLEAR) {
            Log.i(TAG, "Clearing completed progress mediaKey=" + mediaKey);
            clearSavedProgress();
            return;
        }
        // A failed replacement source may stop near zero; preserve any valid resume point already stored.
        if (action == PlaybackProgressPolicy.Action.KEEP_EXISTING) return;

        Log.i(TAG, "Saving progress mediaKey=" + mediaKey + " position=" + position);
        playbackPrefs.edit().putLong(mediaKey, position).apply();
    }

    private void clearSavedProgress() {
        if (mediaKey == null || mediaKey.isEmpty()) {
            return;
        }
        Log.i(TAG, "clearSavedProgress mediaKey=" + mediaKey);
        playbackPrefs.edit().remove(mediaKey).apply();
    }

    private void parseEpisodeMarkers(String metadataJson) {
        recapMarker = null;
        introMarker = null;
        if (metadataJson == null || metadataJson.isEmpty() || mediaKey == null || !mediaKey.contains(":tv:")) {
            return;
        }

        try {
            JSONObject metadata = new JSONObject(metadataJson);
            int season = metadata.optInt("season", 0);
            int episode = metadata.optInt("episode", 0);
            String expectedEpisodeSuffix = ":s" + season + ":e" + episode;
            if (season <= 0 || episode <= 0 || !mediaKey.endsWith(expectedEpisodeSuffix)) {
                Log.w(TAG, "Ignoring episode markers that do not match mediaKey=" + mediaKey);
                return;
            }

            recapMarker = parseEpisodeMarker(metadata.optJSONObject("recapMarker"), "recap");
            introMarker = parseEpisodeMarker(metadata.optJSONObject("introMarker"), "intro");
        } catch (Exception error) {
            Log.w(TAG, "Ignoring malformed playback metadata", error);
        }
    }

    private EpisodeMarker parseEpisodeMarker(JSONObject marker, String type) {
        if (marker == null) {
            return null;
        }

        long startMs = marker.optLong("startMs", -1L);
        long endMs = marker.optLong("endMs", -1L);
        double confidence = marker.optDouble("confidence", 0.5d);
        String match = marker.optString("match", "reported");
        if (startMs < 0L || endMs <= startMs || confidence < 0.5d || "out-of-range".equalsIgnoreCase(match)) {
            Log.w(TAG, "Ignoring invalid " + type + " marker startMs=" + startMs + " endMs=" + endMs + " confidence=" + confidence + " match=" + match);
            return null;
        }

        String provider = marker.optString("provider", "episode database");
        Log.i(TAG, "Loaded " + type + " marker from " + provider + " startMs=" + startMs + " endMs=" + endMs);
        return new EpisodeMarker(type, startMs, endMs, provider);
    }

    private void setupSegmentSkipPrompt() {
        segmentSkipPromptShown = false;
        activeSkipMarker = null;
        hideSegmentSkipPrompt();
        if (segmentSkipButton == null || segmentSkipCancelButton == null) {
            return;
        }

        configurePromptButton(segmentSkipButton, true);
        configurePromptButton(segmentSkipCancelButton, false);
        segmentSkipButton.setOnClickListener(v -> skipActiveSegment());
        segmentSkipCancelButton.setOnClickListener(v -> dismissSegmentSkipPrompt());
    }

    private void updateSegmentSkipPrompt() {
        if (player == null || segmentSkipPrompt == null || isAudioTrackPanelVisible()) {
            return;
        }

        long duration = player.getDuration();
        long position = player.getCurrentPosition();
        if (segmentSkipPromptShown && activeSkipMarker != null) {
            if (!IntroSkipPolicy.shouldShow(
                mediaKey,
                activeSkipMarker.startMs,
                activeSkipMarker.endMs,
                position,
                duration,
                false
            )) {
                if (IntroSkipPolicy.hasPassed(activeSkipMarker.endMs, position)) {
                    activeSkipMarker.dismissed = true;
                }
                segmentSkipPromptShown = false;
                activeSkipMarker = null;
                hideSegmentSkipPrompt();
            }
            return;
        }

        if (showMarkerIfActive(recapMarker, position, duration)) {
            return;
        }
        showMarkerIfActive(introMarker, position, duration);
    }

    private boolean showMarkerIfActive(EpisodeMarker marker, long position, long duration) {
        if (marker == null || marker.dismissed) {
            return false;
        }
        if (IntroSkipPolicy.hasPassed(marker.endMs, position)) {
            marker.dismissed = true;
            return false;
        }
        if (!IntroSkipPolicy.shouldShow(mediaKey, marker.startMs, marker.endMs, position, duration, false)) {
            return false;
        }

        activeSkipMarker = marker;
        segmentSkipPromptShown = true;
        boolean isRecap = "recap".equals(marker.type);
        if (segmentSkipTitle != null) {
            segmentSkipTitle.setText(isRecap ? R.string.recap_skip_title : R.string.intro_skip_title);
        }
        if (segmentSkipDetail != null) {
            segmentSkipDetail.setText(getString(R.string.segment_skip_detail_format, formatPlaybackPosition(marker.endMs)));
        }
        segmentSkipButton.setText(isRecap ? R.string.skip_recap : R.string.skip_intro);
        segmentSkipPrompt.setVisibility(View.VISIBLE);
        segmentSkipPrompt.bringToFront();
        updateAudioTrackButtonVisibility();
        segmentSkipButton.requestFocus();
        Log.i(TAG, "Showing skip " + marker.type + " prompt at positionMs=" + position + " marker=" + marker.startMs + "-" + marker.endMs + " provider=" + marker.provider);
        return true;
    }

    private void skipActiveSegment() {
        if (player == null || activeSkipMarker == null) {
            return;
        }

        EpisodeMarker marker = activeSkipMarker;
        long targetPosition = IntroSkipPolicy.resolveSeekPosition(player.getCurrentPosition(), marker.endMs, player.getDuration());
        Log.i(TAG, "Skipping " + marker.type + " to positionMs=" + targetPosition);
        marker.dismissed = true;
        segmentSkipPromptShown = false;
        activeSkipMarker = null;
        hideSegmentSkipPrompt();
        player.seekTo(targetPosition);
        player.play();
        playerView.requestFocus();
    }

    private void dismissSegmentSkipPrompt() {
        if (activeSkipMarker != null) {
            activeSkipMarker.dismissed = true;
        }
        segmentSkipPromptShown = false;
        activeSkipMarker = null;
        hideSegmentSkipPrompt();
        if (playerView != null) {
            playerView.requestFocus();
        }
    }

    private boolean isSegmentSkipPromptVisible() {
        return segmentSkipPrompt != null && segmentSkipPrompt.getVisibility() == View.VISIBLE;
    }

    private void hideSegmentSkipPrompt() {
        if (segmentSkipPrompt != null) {
            segmentSkipPrompt.setVisibility(View.GONE);
        }
        updateAudioTrackButtonVisibility();
    }

    private String formatPlaybackPosition(long positionMs) {
        long totalSeconds = Math.max(0L, positionMs) / 1000L;
        return String.format(Locale.US, "%d:%02d", totalSeconds / 60L, totalSeconds % 60L);
    }

    private void setupNextEpisodePrompt() {
        if (nextEpisodePrompt == null) {
            return;
        }

        nextPromptShown = false;
        nextPromptDismissed = false;
        nextEpisodeLaunchRequested = false;
        hideNextEpisodePrompt();

        if (nextSeason <= 0 || nextEpisode <= 0) {
            Log.w(TAG, "Next episode prompt unavailable because playback target is missing: S" + nextSeason + "E" + nextEpisode);
            return;
        }

        nextEpisodeTitle.setText(getString(
            autoplayNextEpisode ? R.string.up_next_episode_autoplay : R.string.up_next_episode,
            nextSeason,
            nextEpisode
        ));
        configurePromptButton(nextEpisodeButton, true);
        configurePromptButton(nextEpisodeCancelButton, false);
        nextEpisodeButton.setOnClickListener(v -> launchNextEpisode());
        nextEpisodeCancelButton.setOnClickListener(v -> {
            nextPromptDismissed = true;
            hideNextEpisodePrompt();
        });
    }

    private void updateNextEpisodePrompt() {
        if (player == null || nextPromptDismissed || nextPromptShown || isAudioTrackPanelVisible() || nextSeason <= 0 || nextEpisode <= 0) {
            return;
        }

        long duration = player.getDuration();
        long position = player.getCurrentPosition();
        if (duration == C.TIME_UNSET || duration <= 0 || position < 0) {
            return;
        }

        long remainingMs = Math.max(0L, duration - position);
        if (remainingMs > NEXT_EPISODE_PROMPT_THRESHOLD_MS) {
            return;
        }

        nextPromptShown = true;
        nextEpisodePrompt.setVisibility(View.VISIBLE);
        nextEpisodePrompt.bringToFront();
        updateAudioTrackButtonVisibility();
        nextEpisodeButton.requestFocus();
        Log.i(TAG, "Showing next episode prompt for S" + nextSeason + "E" + nextEpisode + " remainingMs=" + remainingMs);
    }

    private void hideNextEpisodePrompt() {
        if (nextEpisodePrompt != null) {
            nextEpisodePrompt.setVisibility(View.GONE);
        }
        updateAudioTrackButtonVisibility();
    }

    private void launchNextEpisode() {
        if (nextEpisodeLaunchRequested || nextSeason <= 0 || nextEpisode <= 0) {
            return;
        }
        nextEpisodeLaunchRequested = true;
        hideNextEpisodePrompt();
        Intent intent = new Intent(this, MainActivity.class);
        intent.putExtra("native_action", "play_next_episode");
        intent.putExtra("season", nextSeason);
        intent.putExtra("episode", nextEpisode);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        finish();
    }

    private void configurePromptButton(Button button, boolean primary) {
        if (button == null) {
            return;
        }

        final int normalBg = Color.parseColor(primary ? "#2A2A2A" : "#1A1A1A");
        final int focusedBg = Color.parseColor(primary ? "#E50914" : "#FFFFFF");
        final int normalText = Color.WHITE;
        final int focusedText = Color.parseColor(primary ? "#FFFFFF" : "#000000");

        button.setAllCaps(true);
        button.setTextSize(18f);
        button.setPadding(36, 22, 36, 22);
        applyPromptButtonStyle(button, false, normalBg, focusedBg, normalText, focusedText);
        button.setOnFocusChangeListener((view, hasFocus) ->
            applyPromptButtonStyle(button, hasFocus, normalBg, focusedBg, normalText, focusedText)
        );
    }

    private void applyPromptButtonStyle(Button button, boolean focused, int normalBg, int focusedBg, int normalText, int focusedText) {
        button.setBackgroundTintList(ColorStateList.valueOf(focused ? focusedBg : normalBg));
        button.setTextColor(focused ? focusedText : normalText);
        button.setScaleX(focused ? 1.08f : 1f);
        button.setScaleY(focused ? 1.08f : 1f);
        button.setAlpha(focused ? 1f : 0.82f);
    }
}
