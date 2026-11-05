# Spidey S4:E4 playback investigation

Device: Fire TV AFTR, 192.168.4.25. Tested 2026-11-04.

The app requested TMDB 127635, season 4, episode 4 (Rhino’s Wild Bunch).
The backend returned no direct links, only web-player sources.
The initial web player failed with “Verification failed. Please reload.”
Testing alternate sources reached the native player, but the returned media failed with ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED. The player exhausted its available source list. Successful playback was not observed.

Version 155 fixed stale next-episode actions after selecting another episode; the show now displays S4:E5 as next. Added an asynchronous regression test.
Version 156 adds a Fire TV Menu-button playback dialog with Reload source, Try another source, and Back to title. Verified opening it and choosing another source on the affected TV.

Validation: npm test and npm run build:android passed. Version 156 installed successfully. No claim that episode playback is repaired.


## Version 157: verified replacement

VidFast at https://vidfast.vc/tv/127635/4/4 played on the affected TV, but the viewer described the King Lizard story. Testing /4/2 also played; the viewer confirmed one of Giant-Sized Lizard / Rhino's Wild Bunch. This provider uses combined stories for the tested episode. Added VidFast as a primary source, preferred when healthy, with the explicit verified S4:E4 -> provider S4:E2 exception and a combined-story source label. No guessed start offset is applied. The file begins with Giant-Sized Lizard and contains Rhino's Wild Bunch afterward. Other episode mappings have not been verified.

Single-story intro/recap markers are suppressed for this paired source, including native source failover. Version 157 installed on 192.168.4.25; native playback starts with duration 24:05. Full npm test and npm run build:android passed. Screenshots cannot capture the video surface, so picture confirmation relies on the viewer's replies above.

Final v158 also excludes VidFast for unverified Spidey episodes; other providers remain available for those episodes. Targeted JS/mapping/playback checks and Android assembly passed after this guard.
