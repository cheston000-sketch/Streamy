package org.streamy.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.ClipData;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.Arrays;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final long MIN_UPDATE_APK_BYTES = 1024L * 1024L;
    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private File pendingUpdateApk;
    private boolean awaitingInstallPermission;
    private boolean installerLaunched;
    private final AtomicBoolean updateDownloadInProgress = new AtomicBoolean(false);
    private long pendingUpdateVersion;
    private boolean nativeActionDispatchPending;
    private int nativeActionDispatchAttempts;
    private static final int MAX_NATIVE_ACTION_DISPATCH_ATTEMPTS = 60;
    private static final long NATIVE_ACTION_RETRY_DELAY_MS = 500L;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) {
            String pendingPath = savedInstanceState.getString("pendingUpdatePath");
            if (pendingPath != null) pendingUpdateApk = new File(pendingPath);
            pendingUpdateVersion = savedInstanceState.getLong("pendingUpdateVersion");
            awaitingInstallPermission = savedInstanceState.getBoolean("awaitingInstallPermission");
            installerLaunched = savedInstanceState.getBoolean("installerLaunched");
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));

        WebView webView = this.bridge.getWebView();
        WebSettings settings = webView.getSettings();

        // Allow media autoplay without user gesture (needed for Fire OS TV)
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setDomStorageEnabled(true);
        settings.setJavaScriptEnabled(true);

        // 🔥 SPOOF USER AGENT 🔥
        // VidSrc/Vidlink intentionally block or serve "dead links" to Fire TV UA.
        // We spoof a modern standard Windows PC Chrome browser to completely bypass this ban!
        String desktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
        settings.setUserAgentString(desktopUA);

        // ── Inject the native JS bridge so player.js can call Native Hardware Bridge ──────
        webView.addJavascriptInterface(new StreamBridge(this), "NativeBridge");

        // An opaque surface prevents Fire OS from leaving the launch window visible
        // until the WebView receives a later redraw.
        webView.setBackgroundColor(Color.BLACK);
        webView.setKeepScreenOn(true);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleWebAppBack();
            }
        });
        maybeHandleNativeAction(getIntent());
    }

    void onWebAppReady() {
        runOnUiThread(() -> {
            WebView webView = this.bridge.getWebView();
            webView.setAlpha(0.99f);
            webView.postOnAnimation(() -> {
                webView.setAlpha(1f);
                webView.requestFocus();
                webView.invalidate();
                getWindow().getDecorView().invalidate();
            });
            maybeHandleNativeAction(getIntent());
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        maybeHandleNativeAction(intent);
        if (Intent.ACTION_MAIN.equals(intent.getAction()) && !intent.hasExtra("native_action")) {
            evaluateUpdateJavascript("window.StreamOSProfiles && window.StreamOSProfiles.showStartup();");
        }
    }

    @Override
    public void onResume() {
        super.onResume();

        maybeHandleNativeAction(getIntent());

        evaluateUpdateJavascript("window.StreamOSUpdate && window.StreamOSUpdate.onInstallPermissionChanged && window.StreamOSUpdate.onInstallPermissionChanged();");
        if (awaitingInstallPermission) {
            awaitingInstallPermission = false;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                if (pendingUpdateApk != null) launchApkInstaller();
            } else {
                notifyUpdateState("failed", "Installation permission is required. Select Update now to try again.");
            }
            return;
        }

        if (installerLaunched) {
            installerLaunched = false;
            notifyInstallerReturned();
        }
    }

    void downloadAndInstallUpdate(String url, long expectedVersion) {
        if (url == null || url.trim().isEmpty()) {
            notifyUpdateState("failed", "The update address is missing. Please try again.");
            return;
        }

        if (!updateDownloadInProgress.compareAndSet(false, true)) return;
        pendingUpdateVersion = expectedVersion;
        notifyUpdateState("downloading", "Downloading the Vela update...");
        updateExecutor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                File directory = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (directory == null && (directory = getCacheDir()) == null) {
                    throw new IllegalStateException("No update storage is available");
                }
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IllegalStateException("Could not create update storage");
                }

                File temporaryApk = new File(directory, "StreamOS-update.download");
                File completedApk = new File(directory, "StreamOS-update.apk");
                if (temporaryApk.exists()) temporaryApk.delete();
                if (completedApk.exists()) completedApk.delete();

                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(20_000);
                connection.setReadTimeout(90_000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream");
                connection.connect();
                int statusCode = connection.getResponseCode();
                if (statusCode < 200 || statusCode >= 300) {
                    throw new IllegalStateException("Update server returned " + statusCode);
                }

                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporaryApk)) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                    }
                    output.getFD().sync();
                }

                if (temporaryApk.length() < MIN_UPDATE_APK_BYTES || !hasZipHeader(temporaryApk)) {
                    throw new IllegalStateException("Downloaded file is not a valid APK");
                }
                validateUpdatePackage(temporaryApk, expectedVersion);
                if (!temporaryApk.renameTo(completedApk)) {
                    throw new IllegalStateException("Could not finalize the downloaded update");
                }

                pendingUpdateApk = completedApk;
                runOnUiThread(() -> {
                    notifyUpdateState("installing", "Download complete. Finish installation in the Fire OS prompt.");
                    requestInstallPermissionOrLaunch();
                });
            } catch (Exception error) {
                Log.e(TAG, "Update download failed", error);
                notifyUpdateState("failed", "Update could not be installed: " + error.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
                updateDownloadInProgress.set(false);
            }
        });
    }

    void exitForRequiredUpdate() {
        runOnUiThread(this::finishAffinity);
    }

    private boolean hasZipHeader(File file) {
        try (FileInputStream input = new FileInputStream(file)) {
            return input.read() == 'P' && input.read() == 'K';
        } catch (Exception ignored) {
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private void validateUpdatePackage(File apkFile, long expectedVersion) {
        // Fire OS 7 can report API 28 while leaving SigningInfo null.
        int flags = PackageManager.GET_SIGNATURES;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) flags |= PackageManager.GET_SIGNING_CERTIFICATES;
        PackageInfo packageInfo = getPackageManager().getPackageArchiveInfo(apkFile.getAbsolutePath(), flags);
        if (packageInfo == null || !getPackageName().equals(packageInfo.packageName)) {
            throw new IllegalStateException("Downloaded APK is not a Vela package");
        }

        long downloadedVersion = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? packageInfo.getLongVersionCode()
            : packageInfo.versionCode;
        if (expectedVersion > 0 && downloadedVersion < expectedVersion) {
            throw new IllegalStateException(
                "Downloaded APK version " + downloadedVersion + " is older than required version " + expectedVersion
            );
        }
        try {
            PackageInfo installed = getPackageManager().getPackageInfo(getPackageName(), flags);
            long installedVersion = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? installed.getLongVersionCode() : installed.versionCode;
            if (downloadedVersion < installedVersion) throw new IllegalStateException("Update would downgrade the app");
            Signature[] current = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && installed.signingInfo != null
                ? installed.signingInfo.getApkContentsSigners() : installed.signatures;
            Signature[] incoming = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && packageInfo.signingInfo != null
                ? packageInfo.signingInfo.getApkContentsSigners() : packageInfo.signatures;
            if (current == null || incoming == null || current.length == 0 || !Arrays.equals(current, incoming)) {
                throw new IllegalStateException("Update signing certificate does not match the installed app");
            }
        } catch (PackageManager.NameNotFoundException error) {
            throw new IllegalStateException("Unable to verify the installed app", error);
        }
    }

    boolean canInstallUpdates() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls();
    }

    void openInstallPermissionSettings() {
        runOnUiThread(() -> {
            if (canInstallUpdates()) {
                evaluateUpdateJavascript("window.StreamOSUpdate && window.StreamOSUpdate.onInstallPermissionChanged();");
                return;
            }
            awaitingInstallPermission = true;
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())));
            } catch (Exception error) {
                try {
                    startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS));
                } catch (Exception unavailable) {
                    awaitingInstallPermission = false;
                    notifyUpdateState("failed", "Open Fire TV Settings > My Fire TV > Developer options > Install unknown apps and enable Vela.");
                }
            }
        });
    }

    private void requestInstallPermissionOrLaunch() {
        if (pendingUpdateApk == null || !pendingUpdateApk.exists()) {
            notifyUpdateState("failed", "The downloaded update could not be found. Please try again.");
            return;
        }

        if (!canInstallUpdates()) {
            notifyUpdateState("permission", "Allow Vela to install updates in Fire TV Settings, then return here.");
            openInstallPermissionSettings();
            return;
        }
        launchApkInstaller();
    }

    private void launchApkInstaller() {
        if (pendingUpdateApk == null || !pendingUpdateApk.exists()) {
            notifyUpdateState("failed", "The downloaded update could not be found. Please try again.");
            return;
        }

        try {
            validateUpdatePackage(pendingUpdateApk, pendingUpdateVersion);
        } catch (Exception error) {
            Log.e(TAG, "Update validation failed", error);
            notifyUpdateState("failed", "This update cannot replace the installed app. Please download a matching update.");
            return;
        }
        Uri apkUri = FileProvider.getUriForFile(
            this,
            getPackageName() + ".fileprovider",
            pendingUpdateApk
        );
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.setClipData(ClipData.newRawUri("Vela update", apkUri));
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            installerLaunched = true;
            startActivity(installIntent);
        } catch (Exception error) {
            installerLaunched = false;
            Log.e(TAG, "Could not launch APK installer", error);
            notifyUpdateState("failed", "Fire OS could not open the installer. Please try again.");
        }
    }

    private void notifyUpdateState(String state, String message) {
        runOnUiThread(() -> evaluateUpdateJavascript(
            "window.StreamOSUpdate && window.StreamOSUpdate.onDownloadState(" +
                JSONObject.quote(state) + "," + JSONObject.quote(message) + ");"
        ));
    }

    private void notifyInstallerReturned() {
        evaluateUpdateJavascript("window.StreamOSUpdate && window.StreamOSUpdate.onInstallerReturned();");
    }

    private void evaluateUpdateJavascript(String script) {
        if (this.bridge == null) return;
        this.bridge.getWebView().evaluateJavascript(script, null);
    }

    private void maybeHandleNativeAction(Intent intent) {
        if (intent == null || this.bridge == null) {
            return;
        }

        String action = intent.getStringExtra("native_action");
        if (!"play_next_episode".equals(action)) {
            return;
        }

        int season = intent.getIntExtra("season", 0);
        int episode = intent.getIntExtra("episode", 0);
        if (season <= 0 || episode <= 0) {
            intent.removeExtra("native_action");
            return;
        }

        if (nativeActionDispatchPending) {
            return;
        }

        nativeActionDispatchPending = true;
        nativeActionDispatchAttempts = 0;
        dispatchNativeNextEpisode(intent, season, episode);
    }

    private void dispatchNativeNextEpisode(Intent intent, int season, int episode) {
        WebView webView = this.bridge.getWebView();
        webView.postDelayed(() -> {
            if (!"play_next_episode".equals(intent.getStringExtra("native_action"))) {
                nativeActionDispatchPending = false;
                return;
            }

            nativeActionDispatchAttempts++;
            String script = "window.StreamOSNative && window.StreamOSNative.playNextEpisodeFromNative "
                + "? window.StreamOSNative.playNextEpisodeFromNative(" + season + "," + episode + ") : false;";
            webView.evaluateJavascript(script, result -> {
                if ("true".equals(result)) {
                    Log.i(TAG, "Next episode request accepted: S" + season + "E" + episode);
                    intent.removeExtra("native_action");
                    nativeActionDispatchPending = false;
                    nativeActionDispatchAttempts = 0;
                    return;
                }

                if (nativeActionDispatchAttempts < MAX_NATIVE_ACTION_DISPATCH_ATTEMPTS) {
                    dispatchNativeNextEpisode(intent, season, episode);
                } else {
                    Log.w(TAG, "Next episode request is still pending after WebView retries");
                    nativeActionDispatchPending = false;
                }
            });
        }, NATIVE_ACTION_RETRY_DELAY_MS);
    }

    private void handleWebAppBack() {
        WebView webView = this.bridge.getWebView();
        webView.evaluateJavascript(
            "window.StreamOSNative && window.StreamOSNative.handleBack ? window.StreamOSNative.handleBack() : 'exit';",
            value -> {
                if ("\"exit\"".equals(value)) {
                    finish();
                }
            }
        );
    }

    @Override
    public void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        if (pendingUpdateApk != null) state.putString("pendingUpdatePath", pendingUpdateApk.getAbsolutePath());
        state.putLong("pendingUpdateVersion", pendingUpdateVersion);
        state.putBoolean("awaitingInstallPermission", awaitingInstallPermission);
        state.putBoolean("installerLaunched", installerLaunched);
    }

    @Override
    public void onDestroy() {
        updateExecutor.shutdownNow();
        super.onDestroy();
    }
}
