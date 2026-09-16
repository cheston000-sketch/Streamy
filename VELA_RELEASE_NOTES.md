# Vela v120

Vela keeps application ID `org.streamy.app`, the existing signing key, and all
`streamy_*` storage keys so installed apps retain their profiles, history, and
watchlists. The product name and visuals change; these compatibility identifiers
must not be renamed during branding work.

## Frontend and startup

- Shared identity: `css/vela.css`, `www/css/vela.css`, and `icon.svg` in both roots.
- Android launcher artwork: `vela_icon.xml` and `vela_banner.xml`.
- `www` is the Android frontend. Root files are the website, including Live TV.
- `scripts/prepare-app-web.mjs` packages only runtime assets before Capacitor copy.
- A saved profile no longer bypasses the launch chooser. Android launcher intents
  also reopen it. Returning from playback or update settings keeps the current
  session; those transitions are not launcher intents.

## Playback

Videasy now requires iframe context. `WebPlayerActivity` wraps that provider in an
iframe and observes media requests in child frames using AndroidX WebKit document
start scripts. A narrow player activation handles the initial play button.

Keep the following regression protections:

- Do not promote the Videasy iframe into the top level: it redirects to blank.
- Never pass blob URLs, data URLs, or DASH/HLS fragments to ExoPlayer.
- Preserve DASH MIME recognition, referrer/origin, cookies, resume position,
  source fallbacks, next-episode information, and intro/recap metadata.
- Prefer the native player after extraction. Keep TLS certificate validation.

## Updates

Settings exposes installation permission and opens the OS permission page.
The native updater verifies package identity, minimum version, and the installed
signing certificate before opening the package installer. Fire OS 7 can leave
`SigningInfo` null despite API 28; legacy signatures are a required fallback.
Fire OS still asks the viewer to confirm installation.

OTA filenames retain the `StreamOS_vNNN.apk` form for existing-server compatibility.
Building v120 does not publish it to OTA by itself.

## Build and QA

Use JDK 21 and Android SDK 36. Limit Gradle to two workers and a 1536 MB heap.
Use a fresh project cache if a previous machine crash corrupted Gradle locks.

Run `:app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest`.
The explicit `:app:` scope avoids unrelated dependency test APKs.

For this release, the only authorized physical test target is
`192.168.4.26:5555`. Always include `adb -s 192.168.4.26:5555`. Do not use
`connectedAndroidTest`, an unscoped install, or a loop over connected devices.

`VelaDeviceTest` covers profile launch behavior, real Videasy-to-native playback,
and the native update download/installer handoff. The updater test takes an
explicit `updateUrl` pointing to a same-version, same-signature APK fixture.
It must observe the package installer; the presence of an old APK is not success.

Verified on the authorized Fire TV (Fire OS 7 / API 28):

- Profile chooser on cold start, reload, and launcher return with saved profiles.
- Videasy Silo S1E6 and movie 1228710 reach native video playback.
- APK download, signature validation, Install prompt, and successful installation.
- Build and all 30 local Android policy tests pass with JDK 21.
- Website layout checked at desktop and 390px width; Live TV remains web-only.

v120 is a local test release. OTA remains unchanged until explicitly published.
