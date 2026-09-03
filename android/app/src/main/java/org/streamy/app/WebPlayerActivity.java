package org.streamy.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class WebPlayerActivity extends AppCompatActivity {
    private static final String TAG = "WebPlayerActivity";
    private static final int MAX_TEXT_SCAN_BYTES = 2 * 1024 * 1024;
    private static final boolean ENABLE_TEXT_RESOURCE_PROXY = false;
    private static final String DESKTOP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    private static final Pattern STREAM_URL_PATTERN = Pattern.compile(
        "https?://[^\\\"'\\s<>]+?(?:m3u8|mp4|mkv)(?:[^\\\"'\\s<>]*)?",
        Pattern.CASE_INSENSITIVE
    );
    private WebView webView;
    private FrameLayout customViewContainer;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private String rootSite;
    private String mediaKey;
    private long startPositionMs;
    private int nextSeason;
    private int nextEpisode;
    private boolean autoplayNextEpisode;
    private volatile boolean launchedNativePlayer;
    private volatile String currentPageUrl = "";
    private String promotedIframeUrl;
    private String sourceJson;
    private String playbackMetadataJson;
    private int sourceIndex;
    private String playbackTitle;
    private final Runnable noMediaFailoverRunnable = new Runnable() {
        @Override
        public void run() {
            if (!launchedNativePlayer) {
                tryLaunchNextSource("No playable media detected in embedded source");
            }
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_webplayer);

        webView = findViewById(R.id.web_player_view);
        customViewContainer = findViewById(R.id.web_player_custom_view_container);

        final String url = getIntent().getStringExtra("url");
        final String title = getIntent().getStringExtra("title");
        playbackTitle = title;
        mediaKey = getIntent().getStringExtra("mediaKey");
        sourceJson = getIntent().getStringExtra("sourceJson");
        playbackMetadataJson = getIntent().getStringExtra("playbackMetadataJson");
        sourceIndex = getIntent().getIntExtra("sourceIndex", -1);
        startPositionMs = PlaybackIntentParser.parseLong(getIntentExtra("startPositionMs"), 0L);
        nextSeason = parseIntExtra("nextSeason");
        nextEpisode = parseIntExtra("nextEpisode");
        autoplayNextEpisode = getIntent().getBooleanExtra("autoplayNextEpisode", true);
        rootSite = getSiteKey(url);
        Log.i(TAG, "onCreate mediaKey=" + mediaKey + " startPositionMs=" + startPositionMs + " next=S" + nextSeason + "E" + nextEpisode + " title=" + title);

        if (title != null && !title.isEmpty()) {
            setTitle(title);
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setUserAgentString(DESKTOP_USER_AGENT);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setBackgroundColor(Color.BLACK);
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        webView.setKeepScreenOn(true);
        webView.addJavascriptInterface(new StreamOSWebBridge(), "StreamOSWebBridge");
        enterImmersiveMode();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleWebPlayerBack();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    hideCustomView();
                }
                customView = view;
                customViewCallback = callback;
                customViewContainer.removeAllViews();
                customViewContainer.addView(customView, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));
                customViewContainer.setVisibility(View.VISIBLE);
                customViewContainer.bringToFront();
                webView.setVisibility(View.VISIBLE);
                enterImmersiveMode();

                // Some Fire TV WebViews render host fullscreen surfaces as black.
                // Keep it briefly for providers that need it, then fall back to
                // inline discovery if no native media request appeared.
                customViewContainer.postDelayed(() -> {
                    if (!launchedNativePlayer && customView != null) {
                        Log.i(TAG, "Custom view produced no native media; returning to inline player discovery.");
                        hideCustomView();
                        if (webView != null) {
                            injectPlayerHardening(webView);
                        }
                    }
                }, 3500L);
            }

            @Override
            public void onHideCustomView() {
                hideCustomView();
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) {
                    return false;
                }

                if (!request.isForMainFrame()) {
                    return false;
                }

                String nextUrl = uri.toString();
                if (isAllowedMainFrameUrl(nextUrl)) {
                    currentPageUrl = nextUrl;
                    return false;
                }

                Log.i(TAG, "Blocking main-frame navigation to " + nextUrl);
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null) {
                    String streamUrl = uri.toString();
                    if (isBlockedAdUrl(streamUrl.toLowerCase(Locale.ROOT))) {
                        Log.i(TAG, "Blocking ad/tracker resource: " + streamUrl);
                        return emptyResponse();
                    }

                    if (!launchedNativePlayer) {
                        Map<String, String> headers = request.getRequestHeaders();
                        String referer = headers != null ? headers.get("Referer") : null;
                        String origin = headers != null ? headers.get("Origin") : null;
                        if (referer == null || referer.isEmpty()) {
                            referer = currentPageUrl;
                        }
                        final String finalReferer = referer;
                        final String finalOrigin = (origin == null || origin.isEmpty()) && finalReferer != null
                            ? getOrigin(finalReferer)
                            : origin;

                        String mimeType = sniffPlayableMimeType(streamUrl);
                        if (mimeType != null) {
                            launchDetectedMediaFromRequest(streamUrl, mimeType, finalReferer, finalOrigin);
                        } else {
                            WebResourceResponse scannedResponse = maybeProxyAndScanTextResource(request, finalReferer, finalOrigin);
                            if (scannedResponse != null) {
                                return scannedResponse;
                            }
                        }
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onPageStarted(WebView view, String startedUrl, android.graphics.Bitmap favicon) {
                currentPageUrl = startedUrl == null ? currentPageUrl : startedUrl;
                super.onPageStarted(view, startedUrl, favicon);
            }

            @Override
            public void onPageFinished(WebView view, String finishedUrl) {
                currentPageUrl = finishedUrl == null ? currentPageUrl : finishedUrl;
                Log.i(TAG, "onPageFinished url=" + finishedUrl);
                injectPlayerHardening(view);
                super.onPageFinished(view, finishedUrl);
            }
        });

        if (url != null && !url.isEmpty()) {
            currentPageUrl = url;
            webView.loadUrl(url);
            scheduleNoMediaFailover();
        } else {
            finish();
        }
    }

    private boolean isAllowedMainFrameUrl(String url) {
        if (url == null || url.isEmpty()) {
            return true;
        }

        String lower = url.toLowerCase(Locale.ROOT);
        if (lower.startsWith("about:") || lower.startsWith("data:") || lower.startsWith("blob:")) {
            return true;
        }
        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            if (isBlockedAdUrl(lower)) {
                return false;
            }
            return true;
        }
        return false;
    }

    private boolean isBlockedAdUrl(String lowerUrl) {
        return lowerUrl.contains("doubleclick")
            || lowerUrl.contains("googlesyndication")
            || lowerUrl.contains("googleadservices")
            || lowerUrl.contains("adservice")
            || lowerUrl.contains("adsystem")
            || lowerUrl.contains("adnxs")
            || lowerUrl.contains("adsterra")
            || lowerUrl.contains("popads")
            || lowerUrl.contains("propeller")
            || lowerUrl.contains("onclick")
            || lowerUrl.contains("exoclick")
            || lowerUrl.contains("hilltopads")
            || lowerUrl.contains("trafficjunky")
            || lowerUrl.contains("taboola")
            || lowerUrl.contains("outbrain")
            || lowerUrl.contains("prebid")
            || lowerUrl.contains("smartadserver")
            || lowerUrl.contains("scorecardresearch")
            || lowerUrl.contains("vast")
            || lowerUrl.contains("preroll")
            || lowerUrl.contains("xbet")
            || lowerUrl.contains("/banner")
            || lowerUrl.contains("/popup")
            || lowerUrl.contains("popunder");
    }

    private WebResourceResponse emptyResponse() {
        return new WebResourceResponse(
            "text/plain",
            "UTF-8",
            new ByteArrayInputStream("".getBytes(StandardCharsets.UTF_8))
        );
    }

    private void launchDetectedMediaFromRequest(String mediaUrl, String mimeType, String referer, String origin) {
        if (launchedNativePlayer || mediaUrl == null || mediaUrl.isEmpty()) {
            return;
        }

        String playableMimeType = normalizeReportedMimeType(mimeType, mediaUrl);
        if (playableMimeType == null) {
            return;
        }

        launchedNativePlayer = true;
        final String finalReferer = referer == null || referer.isEmpty()
            ? currentPageUrl
            : referer;
        final String finalOrigin = origin == null || origin.isEmpty()
            ? getOrigin(finalReferer)
            : origin;
        runOnUiThread(() -> {
            if (webView != null) {
                webView.removeCallbacks(noMediaFailoverRunnable);
            }
            launchNativePlayer(mediaUrl, playableMimeType, finalReferer, finalOrigin);
        });
    }

    private boolean shouldProxyAndScanTextResource(WebResourceRequest request) {
        if (request == null || request.getUrl() == null || request.getMethod() == null) {
            return false;
        }
        if (!"GET".equalsIgnoreCase(request.getMethod())) {
            return false;
        }

        String lower = request.getUrl().toString().toLowerCase(Locale.ROOT);
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            return false;
        }
        if (isBlockedAdUrl(lower)) {
            return false;
        }

        return lower.contains(".js")
            || lower.contains(".json")
            || lower.contains(".m3u8")
            || lower.contains("playlist")
            || lower.contains("source")
            || lower.contains("stream")
            || lower.contains("embed")
            || lower.contains("player")
            || lower.contains("ajax")
            || lower.contains("api");
    }

    private WebResourceResponse maybeProxyAndScanTextResource(WebResourceRequest request, String referer, String origin) {
        if (!ENABLE_TEXT_RESOURCE_PROXY) {
            return null;
        }
        if (!shouldProxyAndScanTextResource(request)) {
            return null;
        }

        HttpURLConnection connection = null;
        try {
            URL targetUrl = new URL(request.getUrl().toString());
            connection = (HttpURLConnection) targetUrl.openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("User-Agent", DESKTOP_USER_AGENT);
            connection.setRequestProperty("Accept", "*/*");
            if (referer != null && !referer.isEmpty()) {
                connection.setRequestProperty("Referer", referer);
            }
            if (origin != null && !origin.isEmpty()) {
                connection.setRequestProperty("Origin", origin);
            }
            Map<String, String> headers = request.getRequestHeaders();
            if (headers != null) {
                for (Map.Entry<String, String> header : headers.entrySet()) {
                    String name = header.getKey();
                    String value = header.getValue();
                    if (name == null || value == null || name.equalsIgnoreCase("Accept-Encoding")) {
                        continue;
                    }
                    connection.setRequestProperty(name, value);
                }
            }

            int statusCode = connection.getResponseCode();
            long contentLength = connection.getContentLengthLong();
            if (contentLength > MAX_TEXT_SCAN_BYTES) {
                return null;
            }
            String contentType = connection.getContentType();
            String lowerContentType = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT);
            String requestUrl = request.getUrl().toString();
            if (!isTextLikeResponse(lowerContentType, requestUrl)) {
                return null;
            }

            InputStream inputStream = statusCode >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (inputStream == null) {
                return null;
            }

            byte[] body = readLimitedBytes(inputStream, MAX_TEXT_SCAN_BYTES);
            String bodyText = new String(body, StandardCharsets.UTF_8);
            String mediaUrl = findPlayableUrl(bodyText);
            if (mediaUrl != null) {
                String mimeType = sniffPlayableMimeType(mediaUrl);
                launchDetectedMediaFromRequest(mediaUrl, mimeType, referer, origin);
            }

            String mimeType = lowerContentType.contains(";")
                ? lowerContentType.substring(0, lowerContentType.indexOf(';')).trim()
                : (lowerContentType.isEmpty() ? "text/plain" : lowerContentType);
            Map<String, String> responseHeaders = flattenResponseHeaders(connection.getHeaderFields());
            return new WebResourceResponse(
                mimeType,
                "UTF-8",
                Math.max(100, statusCode),
                connection.getResponseMessage() == null ? "OK" : connection.getResponseMessage(),
                responseHeaders,
                new ByteArrayInputStream(body)
            );
        } catch (Exception error) {
            Log.w(TAG, "Text-resource stream scan failed for " + request.getUrl(), error);
            return null;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private boolean isTextLikeResponse(String contentType, String url) {
        String lowerUrl = url == null ? "" : url.toLowerCase(Locale.ROOT);
        return contentType.contains("text/")
            || contentType.contains("javascript")
            || contentType.contains("json")
            || contentType.contains("mpegurl")
            || contentType.contains("xml")
            || lowerUrl.contains(".js")
            || lowerUrl.contains(".json")
            || lowerUrl.contains(".m3u8");
    }

    private byte[] readLimitedBytes(InputStream inputStream, int maxBytes) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        while ((read = inputStream.read(buffer)) != -1) {
            int allowed = Math.min(read, maxBytes - total);
            if (allowed > 0) {
                output.write(buffer, 0, allowed);
                total += allowed;
            }
            if (total >= maxBytes) {
                break;
            }
        }
        inputStream.close();
        return output.toByteArray();
    }

    private Map<String, String> flattenResponseHeaders(Map<String, List<String>> rawHeaders) {
        Map<String, String> responseHeaders = new HashMap<>();
        if (rawHeaders == null) {
            return responseHeaders;
        }
        for (Map.Entry<String, List<String>> entry : rawHeaders.entrySet()) {
            if (entry.getKey() == null || entry.getValue() == null || entry.getValue().isEmpty()) {
                continue;
            }
            responseHeaders.put(entry.getKey(), entry.getValue().get(0));
        }
        return responseHeaders;
    }

    private String findPlayableUrl(String text) {
        if (text == null || text.isEmpty()) {
            return null;
        }

        Matcher matcher = STREAM_URL_PATTERN.matcher(text);
        while (matcher.find()) {
            String candidate = normalizeEscapedMediaUrl(matcher.group());
            if (candidate == null || candidate.isEmpty() || isBlockedAdUrl(candidate.toLowerCase(Locale.ROOT))) {
                continue;
            }
            if (sniffPlayableMimeType(candidate) != null) {
                return candidate;
            }
        }
        return null;
    }

    private String normalizeEscapedMediaUrl(String rawUrl) {
        if (rawUrl == null) {
            return "";
        }
        return rawUrl
            .replace("\\u0026", "&")
            .replace("&amp;", "&")
            .replace("\\/", "/")
            .replace("\\u003d", "=")
            .replace("\\u003f", "?")
            .replace("\\u002F", "/");
    }

    private String getSiteKey(String rawUrl) {
        if (rawUrl == null || rawUrl.isEmpty()) {
            return null;
        }

        Uri uri = Uri.parse(rawUrl);
        String host = uri.getHost();
        if (host == null || host.isEmpty()) {
            return null;
        }

        String[] parts = host.toLowerCase(Locale.ROOT).split("\\.");
        if (parts.length < 2) {
            return host.toLowerCase(Locale.ROOT);
        }

        return parts[parts.length - 2] + "." + parts[parts.length - 1];
    }

    private String sniffPlayableMimeType(String url) {
        if (url == null) {
            return null;
        }

        String lower = url.toLowerCase(Locale.ROOT);
        if (lower.startsWith("blob:") || lower.startsWith("data:")) {
            return null;
        }
        if (isBlockedAdUrl(lower)) {
            return null;
        }
        if (lower.contains(".m3u8") || lower.contains("m3u8")) {
            return "application/vnd.apple.mpegurl";
        }
        if (lower.contains(".mp4") || lower.contains("video/mp4")) {
            return "video/mp4";
        }
        if (lower.contains(".mkv") || lower.contains("matroska")) {
            return "video/x-matroska";
        }
        return null;
    }

    private String normalizeReportedMimeType(String mimeType, String url) {
        if (mimeType != null && !mimeType.isEmpty()) {
            String lower = mimeType.toLowerCase(Locale.ROOT);
            if (lower.contains("mpegurl") || lower.contains("m3u8")) {
                return "application/vnd.apple.mpegurl";
            }
            if (lower.contains("mp4")) {
                return "video/mp4";
            }
            if (lower.contains("matroska") || lower.contains("mkv")) {
                return "video/x-matroska";
            }
        }
        return sniffPlayableMimeType(url);
    }

    private void reportDetectedMedia(String mediaUrl, String mimeType) {
        if (launchedNativePlayer || mediaUrl == null || mediaUrl.isEmpty()) {
            return;
        }

        String playableMimeType = normalizeReportedMimeType(mimeType, mediaUrl);
        if (playableMimeType == null) {
            return;
        }

        launchedNativePlayer = true;
        webView.removeCallbacks(noMediaFailoverRunnable);
        String referer = currentPageUrl;
        String origin = getOrigin(referer);
        Log.i(TAG, "reportDetectedMedia url=" + mediaUrl + " mimeType=" + playableMimeType + " referer=" + referer);
        launchNativePlayer(mediaUrl, playableMimeType, referer, origin);
    }

    private String getOrigin(String rawUrl) {
        if (rawUrl == null || rawUrl.isEmpty()) {
            return "";
        }

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

    private void launchNativePlayer(String url, String mimeType, String referer, String origin) {
        Intent intent = new Intent(this, PlayerActivity.class);
        intent.putExtra("url", url);
        intent.putExtra("mimeType", mimeType);
        intent.putExtra("title", getTitle() != null ? getTitle().toString() : "StreamOS");
        intent.putExtra("referer", referer);
        intent.putExtra("origin", origin);
        intent.putExtra("cookie", getCookieForPlayback(url, referer));
        intent.putExtra("mediaKey", mediaKey);
        intent.putExtra("startPositionMs", startPositionMs);
        intent.putExtra("nextSeason", nextSeason);
        intent.putExtra("nextEpisode", nextEpisode);
        intent.putExtra("autoplayNextEpisode", autoplayNextEpisode);
        intent.putExtra("sourceJson", sourceJson);
        intent.putExtra("sourceIndex", sourceIndex);
        intent.putExtra("playbackMetadataJson", playbackMetadataJson);
        Log.i(TAG, "launchNativePlayer mediaKey=" + mediaKey + " startPositionMs=" + startPositionMs + " next=S" + nextSeason + "E" + nextEpisode + " mimeType=" + mimeType);
        startActivity(intent);
        finish();
    }

    private String getCookieForPlayback(String url, String referer) {
        CookieManager cookieManager = CookieManager.getInstance();
        String cookie = url != null ? cookieManager.getCookie(url) : null;
        if ((cookie == null || cookie.isEmpty()) && referer != null && !referer.isEmpty()) {
            cookie = cookieManager.getCookie(referer);
        }
        return cookie == null ? "" : cookie;
    }

    private void promoteIframe(String iframeUrl) {
        if (iframeUrl == null || iframeUrl.isEmpty() || launchedNativePlayer) {
            return;
        }

        String currentUrl = currentPageUrl;
        if (iframeUrl.equals(currentUrl) || iframeUrl.equals(promotedIframeUrl)) {
            return;
        }

        promotedIframeUrl = iframeUrl;
        Log.i(TAG, "Promoting iframe to main frame: " + iframeUrl);
        if (webView != null) {
            webView.loadUrl(iframeUrl);
            scheduleNoMediaFailover();
        }
    }

    private void scheduleNoMediaFailover() {
        if (webView == null) {
            return;
        }
        webView.removeCallbacks(noMediaFailoverRunnable);
        webView.postDelayed(noMediaFailoverRunnable, 15000L);
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
        JSONObject nextSource = getSourceAt(sourceIndex + 1);
        if (nextSource == null) {
            Log.w(TAG, "No next source available after failure: " + reason);
            finish();
            return;
        }

        launchSource(nextSource, sourceIndex + 1, reason);
    }

    private void launchSource(JSONObject source, int index, String reason) {
        try {
            String url = source.optString("url", "");
            String type = source.optString("type", "iframe");
            String server = source.optString("server", "Backup Source");
            if (url.isEmpty()) {
                Log.w(TAG, "Next source is missing URL after failure: " + reason);
                finish();
                return;
            }

            Log.i(TAG, "Failing over to source " + index + " (" + server + ") because " + reason);
            sourceIndex = index;
            promotedIframeUrl = null;
            hideCustomView();

            if (!"iframe".equalsIgnoreCase(type)) {
                String mimeType = "hls".equalsIgnoreCase(type)
                    ? "application/vnd.apple.mpegurl"
                    : normalizeReportedMimeType(type, url);
                if (mimeType == null) {
                    mimeType = sniffPlayableMimeType(url);
                }
                launchNativePlayer(url, mimeType, currentPageUrl, getOrigin(currentPageUrl));
                return;
            }

            if (playbackTitle != null && !playbackTitle.isEmpty()) {
                setTitle(playbackTitle + " | " + server);
            }
            if (webView != null) {
                webView.loadUrl(url);
                scheduleNoMediaFailover();
            }
        } catch (Exception error) {
            Log.e(TAG, "Failed to launch next source", error);
            finish();
        }
    }

    private int parseIntExtra(String key) {
        return PlaybackIntentParser.parseInt(getIntentExtra(key), 0);
    }

    private Object getIntentExtra(String key) {
        Bundle extras = getIntent().getExtras();
        return extras == null ? null : extras.get(key);
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

    private void hideCustomView() {
        if (customView == null) {
            return;
        }

        customViewContainer.removeView(customView);
        customViewContainer.setVisibility(View.GONE);
        customView = null;
        webView.setVisibility(View.VISIBLE);
        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }
        enterImmersiveMode();
    }

    private void handleWebPlayerBack() {
        if (customView != null) {
            hideCustomView();
            return;
        }

        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            finish();
        }
    }

    private void injectPlayerHardening(WebView target) {
        String script =
            "javascript:(function(){" +
            "window.open=function(){return null;};" +
            "var normalizeUrl=function(raw){" +
            "if(!raw){return '';}" +
            "try{return new URL(raw, location.href).href;}catch(e){return raw;}" +
            "};" +
            "var looksPlayable=function(raw, mime){" +
            "var url=(raw||'').toLowerCase();" +
            "var type=(mime||'').toLowerCase();" +
            "return url.indexOf('.m3u8')>=0||url.indexOf('.mp4')>=0||url.indexOf('.mkv')>=0||type.indexOf('mpegurl')>=0||type.indexOf('mp4')>=0||type.indexOf('matroska')>=0;" +
            "};" +
            "var streamUrlRe=/https?:\\/\\/[^\\\"'\\s<>]+(?:m3u8|mp4|mkv)(?:[^\\\"'\\s<>]*)?/ig;" +
            "var decodeStreamUrl=function(raw){" +
            "return String(raw||'').replace(/\\\\u0026/g,'&').replace(/&amp;/g,'&').replace(/\\\\\\//g,'/');" +
            "};" +
            "var scanText=function(text){" +
            "if(!text||typeof text!=='string'){return false;}" +
            "streamUrlRe.lastIndex=0;" +
            "var hit=null;" +
            "while((hit=streamUrlRe.exec(text))!==null){" +
            "if(reportMedia(decodeStreamUrl(hit[0]),'')){return true;}" +
            "}" +
            "return false;" +
            "};" +
            "var reportMedia=function(raw, mime){" +
            "var normalized=normalizeUrl(raw);" +
            "if(!normalized||!looksPlayable(normalized,mime)){return false;}" +
            "if(window.__streamosLastMedia===normalized){return true;}" +
            "window.__streamosLastMedia=normalized;" +
            "if(window.StreamOSWebBridge&&typeof window.StreamOSWebBridge.reportMedia==='function'){" +
            "window.StreamOSWebBridge.reportMedia(normalized, mime||'');" +
            "return true;" +
            "}" +
            "return false;" +
            "};" +
            "var inspectMediaElements=function(){" +
            "document.querySelectorAll('video').forEach(function(v){" +
            "reportMedia(v.currentSrc||v.src||'', v.currentSrc&&v.currentSrc.indexOf('.m3u8')>=0?'application/vnd.apple.mpegurl':'video/mp4');" +
            "Array.prototype.forEach.call(v.querySelectorAll('source[src]'), function(source){" +
            "reportMedia(source.src||source.getAttribute('src')||'', source.type||'');" +
            "});" +
            "});" +
            "};" +
            "if(!window.__streamosNetworkPatched){" +
            "window.__streamosNetworkPatched=true;" +
            "try{" +
            "var originalFetch=window.fetch;" +
            "window.fetch=function(resource, init){" +
            "var url=typeof resource==='string'?resource:(resource&&resource.url)||'';" +
            "var mime=(init&&init.headers&&(init.headers['Content-Type']||init.headers['content-type']))||'';" +
            "reportMedia(url, mime);" +
            "return originalFetch.apply(this, arguments).then(function(response){" +
            "try{reportMedia(response.url||url, response.headers&&response.headers.get?response.headers.get('content-type'):'');}catch(e){}" +
            "try{response.clone().text().then(scanText).catch(function(){});}catch(e){}" +
            "return response;" +
            "});" +
            "};" +
            "}catch(e){}" +
            "try{" +
            "var originalOpen=XMLHttpRequest.prototype.open;" +
            "XMLHttpRequest.prototype.open=function(method, url){" +
            "this.__streamosUrl=url;" +
            "reportMedia(url, '');" +
            "try{this.addEventListener('load',function(){try{reportMedia(this.responseURL||this.__streamosUrl||'',this.getResponseHeader&&this.getResponseHeader('content-type')||'');scanText(this.responseText||'');}catch(e){}});}catch(e){}" +
            "return originalOpen.apply(this, arguments);" +
            "};" +
            "}catch(e){}" +
            "try{" +
            "var originalSetAttribute=Element.prototype.setAttribute;" +
            "Element.prototype.setAttribute=function(name,value){" +
            "if(String(name||'').toLowerCase()==='src'){reportMedia(value,'');scanText(String(value||''));}" +
            "return originalSetAttribute.apply(this,arguments);" +
            "};" +
            "}catch(e){}" +
            "try{" +
            "['HTMLMediaElement','HTMLSourceElement'].forEach(function(ctorName){" +
            "var proto=window[ctorName]&&window[ctorName].prototype;" +
            "var desc=proto&&Object.getOwnPropertyDescriptor(proto,'src');" +
            "if(desc&&desc.set&&!proto.__streamosSrcPatched){" +
            "Object.defineProperty(proto,'src',{get:desc.get,set:function(value){reportMedia(value,this.type||'');scanText(String(value||''));return desc.set.call(this,value);}});" +
            "proto.__streamosSrcPatched=true;" +
            "}" +
            "});" +
            "}catch(e){}" +
            "try{" +
            "var originalAppendChild=Node.prototype.appendChild;" +
            "Node.prototype.appendChild=function(node){" +
            "try{if(node&&node.getAttribute){var src=node.getAttribute('src')||node.src||'';reportMedia(src,node.type||'');scanText(String(src||''));}}catch(e){}" +
            "return originalAppendChild.apply(this,arguments);" +
            "};" +
            "}catch(e){}" +
            "}" +
            "var clickIfVisible=function(node){" +
            "if(!node){return false;}" +
            "var style=window.getComputedStyle(node);" +
            "if(!style||style.display==='none'||style.visibility==='hidden'||style.opacity==='0'){return false;}" +
            "var rect=node.getBoundingClientRect();" +
            "if(rect.width<24||rect.height<24){return false;}" +
            "try{node.focus();}catch(e){}" +
            "try{node.click(); return true;}catch(e){return false;}" +
            "};" +
            "var closeOverlays=function(){" +
            "var closeSelectors=[" +
            "'button[aria-label*=\"close\" i]'," +
            "'button[title*=\"close\" i]'," +
            "'[class*=\"close\"]'," +
            "'[id*=\"close\"]'," +
            "'[class*=\"dismiss\"]'," +
            "'[class*=\"skip\"]'" +
            "];" +
            "closeSelectors.some(function(sel){" +
            "var nodes=document.querySelectorAll(sel);" +
            "for(var i=0;i<nodes.length;i++){if(clickIfVisible(nodes[i])){return true;}}" +
            "return false;" +
            "});" +
            "};" +
            "var clickPlayButtons=function(){" +
            "var playSelectors=[" +
            "'button[aria-label*=\"play\" i]'," +
            "'button[title*=\"play\" i]'," +
            "'[class*=\"play\"]'," +
            "'[id*=\"play\"]'," +
            "'[data-testid*=\"play\"]'," +
            "'[role=\"button\"]'," +
            "'button'" +
            "];" +
            "for(var s=0;s<playSelectors.length;s++){" +
            "var nodes=document.querySelectorAll(playSelectors[s]);" +
            "for(var i=0;i<nodes.length;i++){if(clickIfVisible(nodes[i])){return true;}}" +
            "}" +
            "return false;" +
            "};" +
            "var reportLargestIframe=function(){" +
            "if(!window.StreamOSWebBridge||typeof window.StreamOSWebBridge.reportIframe!=='function'){return;}" +
            "var frames=document.querySelectorAll('iframe[src]');" +
            "var best=null; var area=0;" +
            "for(var i=0;i<frames.length;i++){" +
            "var frame=frames[i];" +
            "var src=frame.getAttribute('src')||'';" +
            "if(!src||src==='about:blank'){continue;}" +
            "var rect=frame.getBoundingClientRect();" +
            "var nextArea=Math.max(0,rect.width)*Math.max(0,rect.height);" +
            "if(nextArea>area&&rect.width>240&&rect.height>120){area=nextArea; best=frame;}" +
            "}" +
            "if(best){" +
            "var src=best.src||best.getAttribute('src')||'';" +
            "if(src&&src.indexOf('//')===0){src=location.protocol+src;}" +
            "if(src&&src.indexOf('http')===0){window.StreamOSWebBridge.reportIframe(src);}" +
            "}" +
            "};" +
            "var killAds=function(){" +
            "var selectors=[" +
            "'a[target=\"_blank\"]'," +
            "'iframe[src*=\"ad\"]'," +
            "'iframe[src*=\"doubleclick\"]'," +
            "'iframe[src*=\"googlesyndication\"]'," +
            "'div[class*=\"ad\"]'," +
            "'div[id*=\"ad\"]'," +
            "'div[class*=\"banner\"]'," +
            "'div[class*=\"popup\"]'," +
            "'div[role=\"dialog\"]'," +
            "'[aria-label*=\"ad\"]'" +
            "];" +
            "selectors.forEach(function(sel){" +
            "document.querySelectorAll(sel).forEach(function(node){node.remove();});" +
            "});" +
            "document.querySelectorAll('body *').forEach(function(node){" +
            "try{" +
            "var marker=((node.id||'')+' '+(typeof node.className==='string'?node.className:'')).toLowerCase();" +
            "if(marker.indexOf('player')>=0||marker.indexOf('video')>=0||marker.indexOf('media')>=0||marker.indexOf('jw')>=0||marker.indexOf('vjs')>=0||marker.indexOf('plyr')>=0){return;}" +
            "if(node.querySelector&&node.querySelector('video,iframe,canvas')){return;}" +
            "var style=window.getComputedStyle(node);" +
            "if(!style||style.position!=='fixed'){return;}" +
            "var z=parseInt(style.zIndex||'0',10);" +
            "var rect=node.getBoundingClientRect();" +
            "if(z>=999&&rect.width>window.innerWidth*0.4&&rect.height>window.innerHeight*0.15){node.remove();}" +
            "}catch(e){}" +
            "});" +
            "document.querySelectorAll('video').forEach(function(v){" +
            "v.setAttribute('playsinline','');" +
            "v.setAttribute('webkit-playsinline','');" +
            "v.playsInline=true;" +
            "v.autoplay=true;" +
            "v.controls=true;" +
            "v.defaultMuted=false;" +
            "v.muted=false;" +
            "v.volume=1.0;" +
            "try{var p=v.play(); if(p&&typeof p.catch==='function'){p.catch(function(){});} }catch(e){}" +
            "reportMedia(v.currentSrc||v.src||'', '');" +
            "if(v.style){v.style.opacity='1';v.style.visibility='visible';v.style.display='block';}" +
            "});" +
            "try{scanText(document.documentElement&&document.documentElement.innerHTML||'');}catch(e){}" +
            "try{performance.getEntriesByType('resource').forEach(function(entry){reportMedia(entry.name||'', '');scanText(entry.name||'');});}catch(e){}" +
            "document.querySelectorAll('iframe,video').forEach(function(node){" +
            "if(node.style){node.style.opacity='1';node.style.visibility='visible';node.style.background='black';}" +
            "});" +
            "inspectMediaElements();" +
            "closeOverlays();" +
            "clickPlayButtons();" +
            "reportLargestIframe();" +
            "};" +
            "if(!window.__streamosFullscreenPatched){" +
            "window.__streamosFullscreenPatched=true;" +
            "window.__streamosForceInline=function(){" +
            "try{if(document.fullscreenElement && document.exitFullscreen){document.exitFullscreen();}}catch(e){}" +
            "try{if(document.webkitFullscreenElement && document.webkitExitFullscreen){document.webkitExitFullscreen();}}catch(e){}" +
            "try{document.querySelectorAll('video').forEach(function(v){if(typeof v.webkitExitFullscreen==='function'){v.webkitExitFullscreen();}});}catch(e){}" +
            "};" +
            "try{HTMLVideoElement.prototype.requestFullscreen=function(){window.__streamosForceInline(); return Promise.resolve();};}catch(e){}" +
            "try{HTMLVideoElement.prototype.webkitRequestFullscreen=function(){window.__streamosForceInline();};}catch(e){}" +
            "try{HTMLVideoElement.prototype.webkitEnterFullscreen=function(){window.__streamosForceInline();};}catch(e){}" +
            "try{Element.prototype.requestFullscreen=function(){window.__streamosForceInline(); return Promise.resolve();};}catch(e){}" +
            "try{Element.prototype.webkitRequestFullscreen=function(){window.__streamosForceInline();};}catch(e){}" +
            "document.addEventListener('fullscreenchange', window.__streamosForceInline, true);" +
            "document.addEventListener('webkitfullscreenchange', window.__streamosForceInline, true);" +
            "document.addEventListener('fullscreenerror', window.__streamosForceInline, true);" +
            "}" +
            "killAds();" +
            "if(window.__streamosFullscreenTimer){clearInterval(window.__streamosFullscreenTimer);}" +
            "window.__streamosFullscreenTimer=setInterval(function(){if(window.__streamosForceInline){window.__streamosForceInline();} killAds();},250);" +
            "if(window.__streamosAdBlockTimer){clearInterval(window.__streamosAdBlockTimer);}" +
            "window.__streamosAdBlockTimer=setInterval(killAds,500);" +
            "})();";
        target.evaluateJavascript(script, null);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || keyCode == KeyEvent.KEYCODE_DPAD_CENTER) {
            if (webView != null) {
                webView.evaluateJavascript(
                    "(function(){"
                        + "var clickIfVisible=function(node){"
                        + "if(!node){return false;}"
                        + "var style=window.getComputedStyle(node);"
                        + "if(!style||style.display==='none'||style.visibility==='hidden'||style.opacity==='0'){return false;}"
                        + "var rect=node.getBoundingClientRect();"
                        + "if(rect.width<24||rect.height<24){return false;}"
                        + "try{node.focus();}catch(e){}"
                        + "try{node.click(); return true;}catch(e){return false;}"
                        + "};"
                        + "var selectors=['button[aria-label*=\"play\" i]','button[title*=\"play\" i]','[class*=\"play\"]','[id*=\"play\"]','[class*=\"close\"]','[class*=\"dismiss\"]'];"
                        + "for(var s=0;s<selectors.length;s++){"
                        + "var nodes=document.querySelectorAll(selectors[s]);"
                        + "for(var i=0;i<nodes.length;i++){if(clickIfVisible(nodes[i])){return;}}"
                        + "}"
                        + "var v=document.querySelector('video');"
                        + "if(v){ if(v.paused){v.play();} else {v.pause();}}"
                    + "})();",
                    null
                );
                return true;
            }
        }

        if (keyCode == KeyEvent.KEYCODE_MEDIA_NEXT) {
            if (webView != null) {
                webView.evaluateJavascript("if(window.playNextEpisode) window.playNextEpisode();", null);
                return true;
            }
        }

        if (keyCode == KeyEvent.KEYCODE_MEDIA_PREVIOUS) {
            if (webView != null) {
                webView.evaluateJavascript("if(window.playPrevEpisode) window.playPrevEpisode();", null);
                return true;
            }
        }

        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        hideCustomView();
        if (webView != null) {
            webView.removeCallbacks(noMediaFailoverRunnable);
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    private final class StreamOSWebBridge {
        @JavascriptInterface
        public void reportIframe(String iframeUrl) {
            runOnUiThread(() -> promoteIframe(iframeUrl));
        }

        @JavascriptInterface
        public void reportMedia(String mediaUrl, String mimeType) {
            runOnUiThread(() -> reportDetectedMedia(mediaUrl, mimeType));
        }
    }
}
