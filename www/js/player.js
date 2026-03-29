import { DOM, getSeriesProgress, saveSeriesProgress, toggleWatchlist, isInWatchlist } from './ui.js?v=79';
import { fetchTVEpisodeList, fetchTVSeasons, IMAGE_URL, getProxyHost, getDiscoveryLogs } from './api.js?v=80';
import { navigateTo } from './router.js?v=79';

let currentMovieContext = null;

// Extraction Endpoint (Dynamic Discovery v77)
function getExtractionApi() {
    return getProxyHost();
}

const UPDATE_SERVER = 'https://streamy-vez5.onrender.com';

export async function openDetails(movie) {
    currentMovieContext = movie;
    DOM.detTitle.textContent = movie.title;
    DOM.detMeta.textContent = `${movie.year} • ${movie.type.toUpperCase()} • ${movie.rating}`;
    DOM.detDesc.textContent = movie.desc;
    DOM.detPoster.src = movie.poster;
    if (movie.backdrop && movie.backdrop !== 'none') DOM.detBackdrop.style.backgroundImage = `url('${movie.backdrop}')`;
    else DOM.detBackdrop.style.backgroundImage = 'none';

    if (movie.type === 'tv') {
        DOM.tvControls.classList.remove('hidden');
        DOM.seasonTabs.innerHTML = '<div style="color:#aaa; padding:20px;">Loading Seasons...</div>';
        DOM.episodeList.innerHTML = '';
        DOM.playBtn.innerHTML = '<i class="fa-solid fa-play"></i> RESUME LATEST';
        
        const seasons = await fetchTVSeasons(movie.id);
        if (seasons && seasons.length > 0) {
            DOM.seasonTabs.innerHTML = '';
            const progress = getSeriesProgress(movie.id);
            let targetSeasonNumber = progress.last_season || 1;
            
            let valid = seasons.find(s => s.season_number === targetSeasonNumber);
            if (!valid) targetSeasonNumber = seasons[0].season_number;

            seasons.forEach(s => {
                if (s.season_number > 0) {
                    const btn = document.createElement('button');
                    btn.className = 'season-item-v2'; 
                    btn.tabIndex = 0;
                    if (s.season_number === targetSeasonNumber) btn.classList.add('active');
                    btn.innerHTML = `Season ${s.season_number}`;
                    
                    btn.onclick = () => {
                        Array.from(DOM.seasonTabs.children).forEach(c => c.classList.remove('active'));
                        btn.classList.add('active');
                        loadEpisodes(movie.id, s.season_number, progress);
                    };
                    btn.onkeydown = (e) => { 
                        if(e.key === 'Enter') btn.click();
                        if(e.key === 'ArrowRight') {
                            const firstEp = DOM.episodeList.querySelector('.episode-card-v2');
                            if(firstEp) firstEp.focus();
                        }
                    };
                    DOM.seasonTabs.appendChild(btn);
                    
                    if (s.season_number === targetSeasonNumber) {
                        setTimeout(() => btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
                    }
                }
            });
            loadEpisodes(movie.id, targetSeasonNumber, progress);
        }
    } else {
        DOM.tvControls.classList.add('hidden');
        DOM.playBtn.innerHTML = '<i class="fa-solid fa-play"></i> WATCH NOW';
    }
    
    // Watchlist state
    const exists = isInWatchlist(movie.id);
    if (exists) {
        DOM.watchlistBtn.innerHTML = '<i class="fa-solid fa-check"></i> ON WATCHLIST';
        DOM.watchlistBtn.classList.add('active');
    } else {
        DOM.watchlistBtn.innerHTML = '<i class="fa-solid fa-plus"></i> WATCHLIST';
        DOM.watchlistBtn.classList.remove('active');
    }
    DOM.watchlistBtn.onclick = () => toggleWatchlist(currentMovieContext, DOM.watchlistBtn);
    
    DOM.playBtn.onclick = () => startScrapingSession(null, null);

    navigateTo('#details');
    setTimeout(() => DOM.playBtn.focus(), 150);
}


async function loadEpisodes(tvId, seasonNum, progressRecord = null) {
    DOM.episodeList.innerHTML = '<div style="color:#aaa; padding:20px;">Loading Episodes...</div>';
    const episodes = await fetchTVEpisodeList(tvId, seasonNum);
    if (episodes && episodes.length > 0) {
        DOM.episodeList.innerHTML = '';
        const progress = progressRecord || getSeriesProgress(tvId);
        let targetEpisodeBtn = null;

        episodes.forEach(e => {
            const card = document.createElement('div');
            card.className = 'episode-card-v2'; 
            card.tabIndex = 0;
            
            const epKey = `s${seasonNum}e${e.episode_number}`;
            const isWatched = progress.watched.includes(epKey);
            const imgUrl = e.still_path ? `${IMAGE_URL}${e.still_path}` : 'https://via.placeholder.com/300x169?text=No+Preview';
            
            card.innerHTML = `
                <div class="ep-thumb-wrapper">
                    <img src="${imgUrl}" class="ep-thumb-v2" loading="lazy">
                    <div class="ep-play-overlay"><i class="fa-solid fa-play" style="font-size:1.5rem; color:white;"></i></div>
                    ${isWatched ? '<div style="position:absolute; top:8px; left:8px; background:#46d369; color:white; padding:4px 8px; border-radius:4px; font-size:10px; font-weight:900; box-shadow:0 2px 5px rgba(0,0,0,0.3);">WATCHED</div>' : ''}
                </div>
                <div class="ep-info-v2">
                    <div class="ep-title-v2">${e.episode_number}. ${e.name || "TBA"}</div>
                    <div class="ep-meta-v2">
                        <span><i class="fa-regular fa-clock"></i> ${e.runtime || '?'} min</span>
                        <span><i class="fa-regular fa-calendar"></i> ${e.air_date || 'TBA'}</span>
                    </div>
                    <div class="ep-overview-v2">${e.overview || "No description available for this episode."}</div>
                </div>
            `;
            
            card.onclick = () => {
                DOM.playBtn.innerHTML = `<i class="fa-solid fa-play"></i> RESUME S${seasonNum}:E${e.episode_number}`;
                startScrapingSession(seasonNum, e.episode_number);
            };
            card.onkeydown = (ev) => { 
                if(ev.key === 'Enter') card.click();
                if(ev.key === 'ArrowLeft') {
                    const activeSeason = DOM.seasonTabs.querySelector('.active');
                    if(activeSeason) activeSeason.focus();
                }
            };
            
            DOM.episodeList.appendChild(card);

            if (seasonNum === progress.last_season && e.episode_number === progress.last_episode) {
                targetEpisodeBtn = card;
            }
        });

        setTimeout(() => {
            if (targetEpisodeBtn) targetEpisodeBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    }
}

function updateWatchHistory(context) {
    if (!context) return;
    const activeProfileRaw = globalThis.localStorage.getItem('streamy_active_profile');
    const histKey = activeProfileRaw ? `streamy_history_${activeProfileRaw}` : 'streamy_history_default';
    let hList = JSON.parse(globalThis.localStorage.getItem(histKey) || '[]');
    hList = hList.filter(m => m.id !== context.id);
    hList.unshift(context);
    if (hList.length > 25) hList = hList.slice(0, 25);
    globalThis.localStorage.setItem(histKey, JSON.stringify(hList));
}

function getInitialEpisode(context, targetS, targetE) {
    if (context.type !== 'tv') return { s: 1, e: 1 };
    if (targetS !== null && targetE !== null) return { s: targetS, e: targetE };
    const progress = getSeriesProgress(context.id);
    return { s: progress.last_season || 1, e: progress.last_episode || 1 };
}

async function performExtraction(hostUrl, movie, s, e) {
    let apiUrl = `${hostUrl}/api/stream?tmdb=${movie.id}&type=${movie.type}&title=${encodeURIComponent(movie.title)}&year=${movie.year}`;
    if (movie.type === 'tv') apiUrl += `&season=${s}&episode=${e}`;

    console.log("[Extraction] Calling:", apiUrl);
    const res = await fetch(apiUrl, {
        headers: { 'bypass-tunnel-reminder': 'true' }
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    return await res.json();
}

function rankLinks(links) {
    return links.sort((a, b) => {
        const score = (link) => {
            let s = 0;
            const lowServ = link.server.toLowerCase();
            const lowUrl = link.url.toLowerCase();
            
            if (lowServ.includes('vidlink')) s += 1000; // v77: Absolute Primary (User Requested)
            if (link.type !== 'iframe') s += 100; // Native is high priority but Vidlink Iframe beats it
            if (lowServ.includes('streamx')) s += 80;
            if (lowServ.includes('vidsrc')) s += 50;
            if (lowUrl.includes('.m3u8')) s += 20;
            return s;
        };
        return score(b) - score(a);
    });
}

const probeLink = async (link) => {
    if (link.type === 'iframe') return true; // Assume iframes are alive
    try {
        console.log(`[Probe] Testing connectivity: ${link.server}...`);
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 3000); 
        await fetch(link.url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
        clearTimeout(id);
        return true; 
    } catch (e) {
        console.warn(`[Probe] Link ${link.server} failed:`, e.message);
        return false;
    }
};

function initScrapingUI(title) {
    DOM.serverList.innerHTML = '';
    DOM.linksTitle.textContent = `Resolving: ${title}`;
    DOM.scraperStatus.classList.remove('hidden');
    DOM.scraperStatus.innerHTML = '<p><i class="fa-solid fa-spinner fa-spin"></i> Proxying remote background extractors natively...</p>';
    navigateTo('#links');
}

async function fetchScraperLinks(movie, s, e) {
    const primaryHost = getExtractionApi();
    DOM.scraperStatus.innerHTML = '<p><i class="fa-solid fa-satellite-dish fa-fade"></i> Connecting to extraction grid...</p>';
    
    try {
        return await performExtraction(primaryHost, movie, s, e);
    } catch (primaryErr) {
        console.warn("[Extraction] Primary host failed, attempting production failover...");
        DOM.scraperStatus.innerHTML = '<p><i class="fa-solid fa-shield-halved fa-fade"></i> Primary failed. Switching to failover node...</p>';
        if (primaryHost === UPDATE_SERVER) throw primaryErr;
        const data = await performExtraction(UPDATE_SERVER, movie, s, e);
        globalThis.localStorage.setItem('streamy_backend_host', UPDATE_SERVER);
        return data;
    }
}

function renderLinkSwitcher(links, bestLink) {
    DOM.serverList.innerHTML = '';
    links.forEach((link, index) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = 'server-btn';
        if (link === bestLink) btn.style.borderColor = 'var(--primary)';
        btn.tabIndex = 0;
        btn.innerHTML = `<i class="fa-solid fa-circle-play" style="color:var(--primary); font-size:36px;"></i> <div><b>Link ${index + 1} (${link.server})</b><br><span style="font-size:16px;color:#aaa;">${link.type.toUpperCase()}</span></div>`;
        btn.onclick = () => {
            if (link.type === 'iframe') playIframeFallback(link.url);
            else playNativeVideo(link.url);
        };
        li.appendChild(btn);
        DOM.serverList.appendChild(li);
    });
}

async function autoSelectAndPlay(links) {
    const sortedLinks = rankLinks(links);
    DOM.scraperStatus.innerHTML = '<p><i class="fa-solid fa-wand-magic-sparkles fa-fade"></i> Analyzing stream quality & latency...</p>';
    
    let bestLink = null;
    for (const link of sortedLinks) {
        if (await probeLink(link)) {
            bestLink = link;
            break;
        }
    }

    if (!bestLink) throw new Error("No responsive sources found in cluster.");

    console.log("[AutoSelection] Selected Best Source:", bestLink.server);
    if (bestLink.server?.toLowerCase().includes('vidlink')) {
        DOM.playerServerCycleBtn.innerHTML = '<i class="fa-solid fa-server"></i> VIDLINK';
    } else {
        DOM.playerServerCycleBtn.innerHTML = `<i class="fa-solid fa-server"></i> ${bestLink.server?.toUpperCase() || 'SOURCE'}`;
    }

    renderLinkSwitcher(sortedLinks, bestLink);
    
    // Immediate Auto-Play
    if (bestLink.type === 'iframe') playIframeFallback(bestLink.url);
    else playNativeVideo(bestLink.url);
}

function handleExtractionError(err) {
    console.error("Stream extraction failed:", err);
    const currentHost = getExtractionApi();
    DOM.scraperStatus.classList.remove('hidden');
    DOM.scraperStatus.innerHTML = `
        <div style="color:white; background:#e50914; padding:20px; border-radius:12px; margin-top:20px; border:4px solid #fff; box-shadow:0 0 40px rgba(229,9,20,0.5);">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:32px;"></i> <b style="font-size:24px;">Extraction Error (v77)</b><br>
            <div style="background:rgba(0,0,0,0.5); padding:10px; border-radius:6px; margin-top:10px; text-align:left;">
                <span style="font-size:14px;color:#ccc;display:block;">Primary Host: ${currentHost}</span>
                <span style="font-size:14px;color:#ff9800;display:block;margin-top:5px;">Reason: ${err.message || "Network Error"}</span>
                <div style="display:flex;gap:10px;margin-top:15px;">
                    <button onclick="location.reload()" style="flex:1;padding:10px;background:white;color:black;border:none;border-radius:4px;font-weight:bold;cursor:pointer;">RETRY CONNECTION</button>
                    <button id="copy-debug-logs-err-btn" style="flex:1;padding:10px;background:rgba(255,255,255,0.2);color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;">COPY DEBUG LOGS</button>
                </div>
            </div>
        </div>
    `;

    const copyBtn = document.getElementById('copy-debug-logs-err-btn');
    if (copyBtn) {
        copyBtn.onclick = () => {
            const logs = getDiscoveryLogs();
            navigator.clipboard.writeText(logs).then(() => {
                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> COPIED';
                setTimeout(() => { if (copyBtn) copyBtn.innerText = 'COPY DEBUG LOGS'; }, 2000);
            });
        };
    }
}

export async function startScrapingSession(targetS = null, targetE = null) {
    if (!currentMovieContext) return;
    updateWatchHistory(currentMovieContext);
    initScrapingUI(currentMovieContext.title);

    const { s, e } = getInitialEpisode(currentMovieContext, targetS, targetE);
    if (currentMovieContext.type === 'tv') saveSeriesProgress(currentMovieContext.id, s, e);

    // ── IMMEDIATE GESTURE-CONTEXT PRE-LOAD ──
    // Load Vidlink instantly (synchronously) before any async work.
    // This keeps the user's tap/click gesture context alive so the browser
    // allows autoplay with full volume. The scraper runs in the background
    // and will switch to a native stream if one is found.
    const ctx = currentMovieContext;
    const isTV = ctx.type === 'tv';
    const vidlinkUrl = isTV
        ? `https://vidlink.pro/tv/${ctx.id}/${s}/${e}?autoplay=true&volume=1.0&muted=0&primaryColor=6366f1&player=v2`
        : `https://vidlink.pro/movie/${ctx.id}?autoplay=true&volume=1.0&muted=0&primaryColor=6366f1&player=v2`;
    playIframeFallback(vidlinkUrl);

    try {
        const data = await fetchScraperLinks(ctx, s, e);
        if (data?.success && data.links?.length > 0) {
            // Only switch away from Vidlink if we got a native (non-iframe) stream
            const nativeLink = data.links.find(l => l.type === 'mp4' || l.type === 'hls');
            if (nativeLink) {
                console.log('[AutoPlay] Switching to native stream:', nativeLink.server);
                playNativeVideo(nativeLink.url);
            }
            // Also render the server switcher UI so user can manually switch
            renderLinkSwitcher(data.links, nativeLink || data.links[0]);
        }
    } catch (err) {
        // Vidlink is already playing — scraper failure is non-fatal
        console.warn('[Scraper] Background scrape failed, Vidlink continues:', err.message);
    }
}

export function playIframeFallback(iframeUrl) {
    // 3/26 Proven Solution: Hand-off to Native Bridge if present
    if (globalThis.NativeBridge && typeof globalThis.NativeBridge.presentStream === 'function') {
         console.log("[NativeBridge] Routing stream to WebPlayerActivity...");
         globalThis.NativeBridge.presentStream(iframeUrl);
         return;
    }

    navigateTo('#player');

    if (currentMovieContext?.type === 'tv') {
        DOM.playerNextEpBtn?.classList.remove('hidden');
        DOM.playerNextEpBtn.onclick = () => playNextEpisode();
    } else {
        DOM.playerNextEpBtn?.classList.add('hidden');
    }

    // Force focus to Back button for D-pad visibility
    setTimeout(() => DOM.playerBackBtn?.focus(), 200);

    DOM.videoPlayer.style.display = 'none';
    if (!DOM.videoPlayer.paused) DOM.videoPlayer.pause();

    // Hide the gesture bridge overlay — not needed since MainActivity sets
    // setMediaPlaybackRequiresUserGesture(false) for the whole WebView.
    const overlay = document.getElementById('iframe-activation-overlay');
    if (overlay) overlay.style.display = 'none';
    
    let iframe = document.getElementById('fallback-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'fallback-iframe';
        iframe.frameBorder = '0';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.background = 'transparent';
        iframe.style.zIndex = '100';
        DOM.iframeWrapper.appendChild(iframe);
    }

    // Always re-set allow attribute before assigning src
    iframe.allowFullscreen = true;
    iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');

    // Block pointer events briefly to prevent accidental ad clicks on load
    iframe.style.pointerEvents = 'none';
    setTimeout(() => { iframe.style.pointerEvents = 'auto'; }, 2000);

    // Force Autoplay parameters
    let url = new URL(iframeUrl);
    url.searchParams.set('autoplay', '1');
    url.searchParams.set('autoPlay', '1');
    url.searchParams.set('muted', '0');
    url.searchParams.set('volume', '1');

    iframe.src = url.toString();
    iframe.style.display = 'block';
    iframe.style.visibility = 'visible';
    iframe.style.opacity = '1';
}

export function playNativeVideo(streamUrl) {
    // 3/26 Proven Solution: Use Native WebPlayerActivity for robust playback on TV
    if (globalThis.NativeBridge && typeof globalThis.NativeBridge.presentStream === 'function') {
         console.log("[NativeBridge] Routing native stream to WebPlayerActivity...");
         globalThis.NativeBridge.presentStream(streamUrl);
         return;
    }

    let iframe = document.getElementById('fallback-iframe');
    if (iframe) iframe.style.display = 'none';
    DOM.videoPlayer.style.display = 'block';
    navigateTo('#player');
    
    if (currentMovieContext?.type === 'tv') {
        DOM.playerNextEpBtn?.classList.remove('hidden');
        DOM.playerNextEpBtn.onclick = () => playNextEpisode();
    } else {
        DOM.playerNextEpBtn?.classList.add('hidden');
    }

    // Force focus to Back button for D-pad visibility
    setTimeout(() => DOM.playerBackBtn?.focus(), 250);

    DOM.videoPlayer.muted = false;
    DOM.videoPlayer.volume = 1; // Hardcode max volume
    DOM.videoPlayer.setAttribute('volume', '1');

    const isM3U8 = streamUrl.includes('.m3u8');
    const canPlayNativeHLS = DOM.videoPlayer.canPlayType('application/vnd.apple.mpegurl');

    if (isM3U8 && !canPlayNativeHLS && globalThis.Hls?.isSupported()) {
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(DOM.videoPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            DOM.videoPlayer.play().catch(() => {
                DOM.videoPlayer.muted = true;
                DOM.videoPlayer.play();
            });
        });
    } else {
        DOM.videoPlayer.src = streamUrl;
        DOM.videoPlayer.load();
        DOM.videoPlayer.oncanplay = () => {
            // Ensure volume is always 100% — never mute
            DOM.videoPlayer.volume = 1;
            DOM.videoPlayer.muted = false;
            DOM.videoPlayer.play().catch(err => {
                console.warn("[Player] Autoplay blocked by browser:", err.message);
                // Do NOT mute — show overlay to let user tap to start
                const overlay = document.getElementById('iframe-activation-overlay');
                if (overlay) {
                    overlay.style.display = 'block';
                    overlay.onclick = () => {
                        overlay.style.display = 'none';
                        DOM.videoPlayer.play();
                    };
                }
            });
        };
    }
    
    if(currentMovieContext?.type === 'tv') {
        DOM.videoPlayer.onended = () => {
             console.log("[Player] Video ended. Starting autoplay sequence...");
             showAutoplayCountdown();
        };
    }
}

let autoplayTimer = null;
function showAutoplayCountdown() {
    if (!currentMovieContext || currentMovieContext.type !== 'tv') return;
    
    const progress = getSeriesProgress(currentMovieContext.id);
    const nextEpNum = (progress.last_episode || 1) + 1;
    DOM.autoplayNextTitle.innerText = `Upcoming: Episode ${nextEpNum}`;
    
    DOM.autoplayOverlay.classList.remove('hidden');
    let seconds = 5;
    DOM.autoplayCountdown.innerText = seconds;
    
    DOM.autoplayCancelBtn.onclick = () => {
        clearInterval(autoplayTimer);
        DOM.autoplayOverlay.classList.add('hidden');
    };
    
    // Focus cancel button for quick opt-out
    setTimeout(() => DOM.autoplayCancelBtn?.focus(), 100);

    autoplayTimer = setInterval(() => {
        seconds--;
        DOM.autoplayCountdown.innerText = seconds;
        if (seconds <= 0) {
            clearInterval(autoplayTimer);
            DOM.autoplayOverlay.classList.add('hidden');
            playNextEpisode();
        }
    }, 1000);
}

async function playNextEpisode() {
    if (!currentMovieContext || currentMovieContext.type !== 'tv') {
        DOM.playerBackBtn.click();
        return;
    }

    const progress = getSeriesProgress(currentMovieContext.id);
    const s = progress.last_season || 1;
    const e = progress.last_episode || 1;

    try {
        const episodes = await fetchTVEpisodeList(currentMovieContext.id, s);
        const nextEp = episodes.find(ep => ep.episode_number === e + 1);

        if (nextEp) {
            console.log(`[Autoplay] Moving to Next Episode: S${s} E${e + 1}`);
            startScrapingSession(s, e + 1);
        } else {
            console.log(`[Autoplay] End of Season ${s}. Checking for Season ${s + 1}...`);
            const seasons = await fetchTVSeasons(currentMovieContext.id);
            const nextSeason = seasons.find(sea => sea.season_number === s + 1);
            if (nextSeason) {
                console.log(`[Autoplay] Moving to Next Season: S${s + 1} E1`);
                startScrapingSession(s + 1, 1);
            } else {
                console.log("[Autoplay] End of Series reached.");
                DOM.playerBackBtn.click();
            }
        }
    } catch (err) {
        console.error("[Autoplay] Failed to transition to next episode:", err);
        DOM.playerBackBtn.click();
    }
}

if (DOM.playerServerCycleBtn) {
    DOM.playerServerCycleBtn.innerHTML = '<i class="fa-solid fa-server"></i> Switch Server';
    DOM.playerServerCycleBtn.onclick = () => navigateTo('#links');
}

if (DOM.playerBackBtn) {
    DOM.playerBackBtn.addEventListener('click', () => globalThis.history.back());
}

if (DOM.playerFullscreenBtn) {
    DOM.playerFullscreenBtn.addEventListener('click', () => {
        let elem = document.getElementById('fallback-iframe') || DOM.videoPlayer;
        if (elem?.style.display !== 'none') {
            if (elem.requestFullscreen) elem.requestFullscreen();
            else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
        }
    });
}
