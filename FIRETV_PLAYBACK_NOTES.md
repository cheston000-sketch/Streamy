# Fire TV Playback Notes

This project has two Android playback paths on purpose:

1. `PlayerActivity`
   Plays direct stream URLs (`.m3u8`, `.mp4`, similar) with Media3/ExoPlayer.
   This is the stable Fire TV video path and should stay the preferred route for direct links.

2. `WebPlayerActivity`
   Opens browser-hosted player pages only as a fallback/discovery layer.
   Its job is to keep hostile ad/fullscreen behavior under control long enough to detect a real media request and then hand that request to `PlayerActivity`.

Do not simplify this back to:

- launching an external Android chooser from `StreamBridge.playStream(...)`
- relying on WebView-hosted video for Fire TV direct playback
- removing inherited `Referer` / `Origin` headers from native playback requests
- treating `WebPlayerActivity` as the final playback surface for Fire TV

Why these guardrails exist:

- Fire TV repeatedly showed audio without video when playback remained inside the embedded host player
- some stream hosts only serve video correctly when the native request includes the same `Referer` / `Origin` context seen in the WebView
- pressing Back and suddenly seeing video was a strong signal that the embedded host page was the unstable layer, not autoplay or volume

Files that carry the working behavior:

- `android/app/src/main/java/org/streamy/app/StreamBridge.java`
- `android/app/src/main/java/org/streamy/app/PlayerActivity.java`
- `android/app/src/main/java/org/streamy/app/WebPlayerActivity.java`
- `android/app/src/main/res/layout/activity_player.xml`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/build.gradle`
- `www/js/player.js`

When changing playback logic in the future:

1. Keep direct playable links on `PlayerActivity`.
2. Use `WebPlayerActivity` only for iframe/browser-hosted discovery or fallback.
3. Test on the actual Fire TV before shipping changes.
4. If native playback opens with no video, inspect the request headers before changing the player surface.
