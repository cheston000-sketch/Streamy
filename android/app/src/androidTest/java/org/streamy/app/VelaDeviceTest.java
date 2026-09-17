package org.streamy.app;

import static org.junit.Assert.*;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.drawable.BitmapDrawable;
import org.json.JSONObject;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.WebView;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.media3.common.Player;
import androidx.media3.ui.PlayerView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Run explicitly with adb -s 192.168.4.26:5555, never connectedAndroidTest. */
@RunWith(AndroidJUnit4.class)
public class VelaDeviceTest {
    private Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> {
            WebView web = activity.findViewById(com.getcapacitor.android.R.id.webview);
            web.evaluateJavascript(script, value -> { result.set(value); ready.countDown(); });
        });
        assertTrue("WebView did not respond", ready.await(5, TimeUnit.SECONDS));
        return result.get();
    }

    private void waitFor(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        for (int n = 0; n < 40; n++) {
            if ("true".equals(evaluate(scenario, script))) return;
            SystemClock.sleep(250);
        }
        screenshot("vela-condition-failure");
        fail("Web condition did not become true: " + script + " active="
            + evaluate(scenario, "JSON.stringify({active: document.activeElement.id || document.activeElement.className, focused: document.hasFocus(), keys: window.qaKeys})"));
    }

    private void hideTestKeyboard(ActivityScenario<MainActivity> scenario) {
        scenario.onActivity(activity -> {
            android.view.inputmethod.InputMethodManager ime = (android.view.inputmethod.InputMethodManager)
                activity.getSystemService(Context.INPUT_METHOD_SERVICE);
            ime.hideSoftInputFromWindow(activity.getWindow().getDecorView().getWindowToken(), 0);
        });
        SystemClock.sleep(500);
    }

    private void screenshot(String name) throws Exception {
        Bitmap bitmap = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        File dir = context().getExternalFilesDir("test-artifacts");
        if (dir != null && (dir.exists() || dir.mkdirs())) {
            try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
            }
        }
    }

    @Test public void profilesAppearOnColdAndLauncherStarts() throws Exception {
        InstrumentationRegistry.getInstrumentation().setInTouchMode(false);
        Intent initialLaunch = context().getPackageManager().getLaunchIntentForPackage(context().getPackageName());
        assertNotNull(initialLaunch);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(initialLaunch)) {
            waitFor(scenario, "document.querySelectorAll('.profile-card').length >= 2 && !document.getElementById('profile-selection-screen').classList.contains('hidden')");
            assertEquals("true", evaluate(scenario, "document.getElementById('main-content').classList.contains('hidden')"));
            assertEquals("\"Vela\"", evaluate(scenario, "document.title"));
            hideTestKeyboard(scenario);
            SystemClock.sleep(800);
            screenshot("vela-profiles");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_RIGHT);
            waitFor(scenario, "document.activeElement === document.querySelectorAll('.profile-card')[1]");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_LEFT);
            waitFor(scenario, "document.activeElement === document.querySelectorAll('.profile-card')[0]");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_CENTER);
            waitFor(scenario, "document.getElementById('profile-selection-screen').classList.contains('hidden')");
            waitFor(scenario, "Array.from(document.querySelectorAll('.poster-card img')).some(img => img.complete && img.naturalWidth > 0)");
            SystemClock.sleep(800);
            screenshot("vela-home");
            evaluate(scenario, "location.reload()");
            waitFor(scenario, "document.querySelectorAll('.profile-card').length >= 2 && !document.getElementById('profile-selection-screen').classList.contains('hidden')");
            assertEquals("true", evaluate(scenario, "!!localStorage.getItem('streamy_active_profile')"));
            evaluate(scenario, "document.querySelector('.profile-card').click()");
            Intent launcher = context().getPackageManager().getLaunchIntentForPackage(context().getPackageName());
            assertNotNull(launcher);
            context().startActivity(launcher);
            waitFor(scenario, "document.getElementById('profile-selection-screen').dataset.selectionRequired === 'true' && !document.getElementById('profile-selection-screen').classList.contains('hidden')");
        }
    }

    @Test public void launcherResolvesVelaBitmapArtwork() throws Exception {
        PackageManager pm = context().getPackageManager();
        Intent launch = pm.getLaunchIntentForPackage(context().getPackageName());
        assertNotNull(launch);
        assertEquals("org.streamy.app.VelaLauncher", launch.getComponent().getClassName());
        android.content.pm.ActivityInfo info = pm.getActivityInfo(launch.getComponent(), 0);
        assertEquals("Vela", info.loadLabel(pm).toString());
        assertTrue(info.loadIcon(pm) instanceof BitmapDrawable);
        assertNotNull(info.loadBanner(pm));
        assertEquals("Vela", pm.getApplicationLabel(context().getApplicationInfo()).toString());
    }

    private void remote(int key) {
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(key);
        SystemClock.sleep(200);
    }

    @Test public void profileActionsWorkWithRemote() throws Exception {
        InstrumentationRegistry.getInstrumentation().setInTouchMode(false);
        String name = "Vela QA " + SystemClock.uptimeMillis();
        String edited = name + " edited";
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitFor(scenario, "document.querySelectorAll('.profile-card').length >= 2");
            SystemClock.sleep(1000);
            waitFor(scenario, "document.hasFocus() && document.activeElement === document.querySelector('.profile-card')");
            evaluate(scenario, "window.qaKeys=[]; document.addEventListener('keydown', e => window.qaKeys.push({key:e.key,repeat:e.repeat,target:e.target.id||e.target.className}),true)");
            try {
                remote(KeyEvent.KEYCODE_DPAD_DOWN);
                waitFor(scenario, "document.activeElement.id === 'add-profile-btn'");
                remote(KeyEvent.KEYCODE_DPAD_RIGHT);
                waitFor(scenario, "document.activeElement.id === 'edit-profiles-btn'");
                remote(KeyEvent.KEYCODE_DPAD_CENTER);
                waitFor(scenario, "document.getElementById('profiles-grid').classList.contains('edit-mode') && document.getElementById('edit-profiles-btn').textContent.includes('Done Editing')");
                waitFor(scenario, "document.activeElement === document.querySelector('.profile-card')");
                remote(KeyEvent.KEYCODE_DPAD_DOWN);
                remote(KeyEvent.KEYCODE_DPAD_LEFT);
                waitFor(scenario, "document.activeElement.id === 'add-profile-btn'");
                remote(KeyEvent.KEYCODE_DPAD_CENTER);
                waitFor(scenario, "!document.getElementById('profile-edit-modal').classList.contains('hidden')");
                evaluate(scenario, "document.getElementById('profile-name-input').value = " + JSONObject.quote(name));
                hideTestKeyboard(scenario);
                evaluate(scenario, "document.querySelector('[data-avatar=\"3\"]').focus()");
                remote(KeyEvent.KEYCODE_DPAD_CENTER);
                waitFor(scenario, "document.querySelector('[data-avatar=\"3\"]').getAttribute('aria-pressed') === 'true'");
                evaluate(scenario, "document.getElementById('save-profile-btn').focus()");
                remote(KeyEvent.KEYCODE_DPAD_CENTER);
                waitFor(scenario, "JSON.parse(localStorage.getItem('streamy_profiles')).filter(p => p.name === " + JSONObject.quote(name) + " && p.avatar === '3').length === 1");
                waitFor(scenario, "document.getElementById('profile-edit-modal').classList.contains('hidden')");
                evaluate(scenario, "Array.from(document.querySelectorAll('.profile-card')).find(p => p.textContent.trim() === " + JSONObject.quote(name) + ").focus()");
                remote(KeyEvent.KEYCODE_DPAD_CENTER);
                waitFor(scenario, "!document.getElementById('profile-edit-modal').classList.contains('hidden') && document.getElementById('modal-profile-title').textContent === 'Edit Profile'");
                evaluate(scenario, "document.getElementById('profile-name-input').value = " + JSONObject.quote(edited));
                hideTestKeyboard(scenario);
                evaluate(scenario, "document.getElementById('save-profile-btn').focus()");
                remote(KeyEvent.KEYCODE_DPAD_CENTER);
                waitFor(scenario, "JSON.parse(localStorage.getItem('streamy_profiles')).some(p => p.name === " + JSONObject.quote(edited) + ")");
            } finally {
                hideTestKeyboard(scenario);
                evaluate(scenario, "localStorage.setItem('streamy_profiles', JSON.stringify(JSON.parse(localStorage.getItem('streamy_profiles')).filter(p => p.name !== " + JSONObject.quote(name) + " && p.name !== " + JSONObject.quote(edited) + "))); document.getElementById('profile-edit-modal').classList.add('hidden'); window.StreamOSProfiles.showStartup()");
            }
        }
    }

    @Test public void videasyReachesNativeVideo() throws Exception {
        String url = InstrumentationRegistry.getArguments().getString("mediaUrl", "https://player.videasy.net/tv/125988/1/6?autoplay=true");
        Intent intent = new Intent(context(), WebPlayerActivity.class).putExtra("url", url)
            .putExtra("title", "Vela playback test").putExtra("mediaKey", "")
            .putExtra("startPositionMs", 0L).putExtra("autoplayNextEpisode", false)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context().startActivity(intent);
        AtomicReference<String> state = new AtomicReference<>("waiting for discovery");
        for (int n = 0; n < 180; n++) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                for (Activity activity : ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)) {
                    if (activity instanceof PlayerActivity) {
                        PlayerView view = activity.findViewById(org.streamy.app.R.id.native_player_view);
                        Player player = view.getPlayer();
                        if (player == null) continue;
                        if (player.getPlayerError() != null) state.set("error: " + player.getPlayerError().getErrorCodeName());
                        else if (player.isPlaying() && player.getCurrentPosition() > 2500 && player.getVideoSize().width > 0) {
                            state.set("playing " + player.getVideoSize().width + "x" + player.getVideoSize().height);
                        } else state.set("native state=" + player.getPlaybackState() + " position=" + player.getCurrentPosition());
                    }
                }
            });
            if (state.get().startsWith("playing")) {
                Log.i("VelaDeviceTest", state.get());
                screenshot("vela-videasy");
                return;
            }
            if (state.get().startsWith("error")) break;
            SystemClock.sleep(500);
        }
        screenshot("vela-videasy-failure");
        fail("Videasy did not reach native video: " + state.get());
    }

    @Test public void nativeUpdaterOpensInstallPrompt() throws Exception {
        String url = InstrumentationRegistry.getArguments().getString("updateUrl");
        assertNotNull("Provide a same-version test APK URL", url);
        int installedVersion = context().getPackageManager().getPackageInfo(context().getPackageName(), 0).versionCode;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitFor(scenario, "!!window.StreamOSUpdate");
            scenario.onActivity(activity -> {
                assertTrue("Vela must be allowed to install updates", activity.canInstallUpdates());
                activity.downloadAndInstallUpdate(url, installedVersion);
            });
            for (int n = 0; n < 100; n++) {
                AccessibilityNodeInfo root = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
                String activePackage = root == null ? "" : String.valueOf(root.getPackageName());
                boolean hasInstallButton = root != null && root.findAccessibilityNodeInfosByText("Install")
                    .stream().anyMatch(node -> "Install".equalsIgnoreCase(String.valueOf(node.getText())));
                if (activePackage.contains("packageinstaller") && hasInstallButton) {
                    SystemClock.sleep(800);
                    screenshot("vela-installer");
                    return;
                }
                SystemClock.sleep(500);
            }
            fail("Validated update did not open the system package installer");
        }
    }
}
