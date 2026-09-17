# Vela v121

## Profile controls

- Remote Select explicitly activates profile buttons and checkboxes once.
- Profile navigation groups the lifted cards into one row, with Add Profile and
  Manage Profiles below it. Focus stays within the chooser or edit dialog.
- Recover focus when Fire OS selects the scroll panel rather than a control.
- Avatar selection is functional and preserved when creating or editing profiles.
- Saving and deleting keep the editing state and Done Editing label consistent.
- Root website and packaged Android frontend share these fixes.

## Launcher and validation

- Replace every legacy Capacitor launcher PNG and vector with Vela artwork.
- Use bitmap application artwork and a stable VelaLauncher activity alias.
  Keep MainActivity, package identity, signing key, and profile storage compatible.
- Regenerate bitmap assets with `scripts/generate-launcher-assets.ps1`.
- On `192.168.4.26:5555`, all three instrumentation checks pass: remote profile
  create/edit/avatar controls, cold/reload/launcher chooser, and native Vela
  launcher label/bitmap resolution. All 30 Android unit tests also pass.
- The Fire TV app library still retained its old StreamOS metadata during QA.
  Checking Amazon Appstore's cache settings requires the device owner's PIN.
  Do not clear app data, uninstall Vela, or reset launcher preferences to fix it.
- OTA artifact: `StreamOS_v121.apk` at repository root, version code 121,
  version name 121.0, SHA-256
  `5281a674c26734bd6e2dd28bee882b64fd2aaf4defca4381812872c616d03fa0`.

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

## OTA release

The tested APK is staged at repository root as `StreamOS_v120.apk`, which is
the directory read by `server/index.js`. Keep the legacy filename for OTA
compatibility; the installed application label is Vela.

- Version code: `120`; version name: `120.0`.
- Package ID: `org.streamy.app`.
- APK SHA-256: `be6690adfa8497db0d970f003acc2cc5a57c24c763347628fd670ce82d81e1b3`.
- Verify `/api/ota` reports 120 after deployment, then verify that the bytes from
  `/api/ota/download` match this digest before announcing the release.
