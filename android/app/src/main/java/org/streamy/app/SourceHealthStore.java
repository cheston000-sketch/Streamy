package org.streamy.app;

import android.content.Context;
import org.json.JSONObject;
import java.util.Locale;

/** Local-only source observations, shared with the app WebView. */
final class SourceHealthStore {
    private static final String PREFS = "streamy_source_health_native";
    private SourceHealthStore() {}

    static String key(JSONObject source) {
        if (source == null) return "";
        String name = source.optString("server", "").toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        if (!name.isEmpty()) return name;
        try { return new java.net.URI(source.optString("url", "")).getHost().toLowerCase(Locale.ROOT); }
        catch (Exception ignored) { return ""; }
    }

    static synchronized String get(Context context, String key) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key, "{}");
    }

    static synchronized void record(Context context, JSONObject source, String status, long startupMs, String reason) {
        String key = key(source);
        if (key.isEmpty()) return;
        try {
            JSONObject state = new JSONObject(get(context, key));
            long now = System.currentTimeMillis();
            state.put("lastStatus", status).put("lastUpdatedAt", now).put("lastReason", reason);
            state.put("server", source.optString("server", key));
            if ("success".equals(status)) {
                state.put("successes", state.optInt("successes") + 1).put("consecutiveFailures", 0).put("cooldownUntil", 0);
                double previous = state.optDouble("startupMs", 0);
                state.put("startupMs", previous > 0 ? previous * 0.7 + startupMs * 0.3 : startupMs);
            } else if ("failed".equals(status)) {
                int consecutive = state.optInt("consecutiveFailures") + 1;
                state.put("failures", state.optInt("failures") + 1).put("consecutiveFailures", consecutive);
                if (consecutive >= 2) state.put("cooldownUntil", now + 15 * 60 * 1000L);
            } else if ("buffering".equals(status)) {
                state.put("bufferCount", state.optInt("bufferCount") + 1);
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(key, state.toString()).apply();
        } catch (Exception ignored) { }
    }

    static synchronized void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }
}
