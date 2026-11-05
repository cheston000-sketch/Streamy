# Reliability-ranked sources, v160

Confirmed recent playback ranks above untested sources; recent failures rank below both. Existing format/provider preferences break ties within those groups. Startup delay, failure rate, and buffering frequency adjust the score. Failed sources can recover after successful playback; old observations age out. The same score drives the list and automatic selection.

History is keyed by provider hostname rather than episode display labels. Native reads preserve older named-provider history, including paired VidFast episodes. The source list refreshes on return from native playback without changing which source a visible card plays. Working History includes only confirmed playback. The Auto-play sources setting now permits manual selection. Source cards are visible after discovery, replacing the prior CSS rule that hid them permanently.

The observed verification-failed/reload page is recorded as a failure only on the current embedded page before native playback; the player then tries the next source. This detects a failure rather than bypassing verification.

Validation: full npm test passed; additional source-card click/rank tests, Android verification-message tests, JS syntax checks, and final APK build passed. Final v160 installed on Fire TVs 192.168.4.25 and 192.168.4.21. On .25, actual S4E8 selection opened VidFast and promoted it to PlayerActivity. Returning to the app showed VidFast first with Played Successfully; Vidlink, MovieTV API, and VidRock were last with Recently Failed. Screenshots: .deploy/firetv-ranking.png and .deploy/firetv-ranking-bottom.png in the local workspace. History is learned independently on each device.
