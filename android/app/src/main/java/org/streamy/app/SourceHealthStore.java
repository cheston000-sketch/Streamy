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
        try {
            String host = new java.net.URI(source.optString("url", "")).getHost();
            if (host != null && !host.isEmpty()) return host.toLowerCase(Locale.ROOT);
        } catch (Exception ignored) { }
        String name = source.optString("server", "").toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        if (!name.isEmpty()) return name;
        try { return new java.net.URI(source.optString("url", "")).getHost().toLowerCase(Locale.ROOT); }
        catch (Exception ignored) { return ""; }
    }

    static synchronized String get(Context context, String key) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.contains(key)) return prefs.getString(key, "{}");
        // Preserve observations from versions that keyed by the display name.
        String alias = key.equals("vidfast.vc") ? "vidfast"
            : key.equals("vidlink.pro") ? "vidlink"
            : key.equals("movietvapi.stream") ? "movietv-api"
            : key.equals("vidrock.net") ? "vidrock"
            : key.equals("vsembed.ru") ? "vsembed"
            : key.equals("multiembed.mov") ? "multiembed"
            : key.equals("vidbinge.dev") ? "vidbinge"
            : key.equals("vidsrc.me") ? "vidsrc-me"
            : key.equals("vidsrc.net") ? "vidsrc-net" : "";
        String newest = "{}";
        long updatedAt = 0;
        for (java.util.Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
            boolean match = !alias.isEmpty() && (entry.getKey().equals(alias)
                || (alias.equals("vidfast") && entry.getKey().startsWith("vidfast-")));
            if (!match) continue;
            try {
                JSONObject state = new JSONObject(String.valueOf(entry.getValue()));
                if (state.optLong("lastUpdatedAt") > updatedAt) {
                    updatedAt = state.optLong("lastUpdatedAt");
                    newest = state.toString();
                }
            } catch (Exception ignored) { }
        }
        return newest;
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
                state.put("lastSuccessAt", now);
                state.put("successes", state.optInt("successes") + 1).put("consecutiveFailures", 0).put("cooldownUntil", 0);
                double previous = state.optDouble("startupMs", 0);
                state.put("startupMs", previous > 0 ? previous * 0.7 + startupMs * 0.3 : startupMs);
            } else if ("failed".equals(status)) {
                state.put("lastFailureAt", now);
                state.put("lastError", reason);
                int consecutive = state.optInt("consecutiveFailures") + 1;
                state.put("failures", state.optInt("failures") + 1).put("consecutiveFailures", consecutive);
                if (consecutive >= 2) state.put("cooldownUntil", now + 15 * 60 * 1000L);
            } else if ("buffering".equals(status)) {
                state.put("bufferCount", state.optInt("bufferCount") + 1);
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(key, state.toString()).apply();
        } catch (Exception ignored) { }
    }

    static synchronized String summary(Context context) {
        JSONObject result = new JSONObject();
        for (java.util.Map.Entry<String, ?> entry : context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getAll().entrySet()) {
            try { result.put(entry.getKey(), new JSONObject(String.valueOf(entry.getValue()))); }
            catch (Exception ignored) { }
        }
        return result.toString();
    }

    static synchronized void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }
}
