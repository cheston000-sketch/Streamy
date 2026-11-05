# Fire TV source test

Version 159 corrects the v158 restriction that excluded VidFast except for Spidey S4:E4. Device logs showed the viewer requesting S4:E8 and receiving only the old providers. Season 4 now follows the paired broadcast ordering listed at https://disneynow.com/show/03f2c0d6-967e-4868-929a-8f2089ce7a85/season-4. Catalog episode n maps to provider episode ceil(n/2), for the 38 catalog stories in the listed 19 broadcast pairs.

Paired source labels identify both stories. Per-source next targets skip the sibling story already included in the file, and survive WebView extraction and native failover. At the final pair, an unresolved next season target is not guessed. Other seasons still need separate verification. The source plays the full pair from its beginning; no unverified midpoint offset is used. Single-story intro/recap markers remain disabled for paired files.

Full npm test and npm run build:android passed. The corrected S4:E8 provider file /tv/127635/4/4 reached native playback on 192.168.4.25 and its timer advanced. Earlier viewer confirmation established that this file contains King Lizard.

Installed v159, opened the show in the app, and requested catalog S4E8 through its native episode-selection action. Logs confirm the app selected VidFast (King Lizard / Go Rhino Go), requested /tv/127635/4/4?autoPlay=true, and retained next target S4E9.
