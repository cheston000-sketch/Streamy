import { DOM, getSeriesProgress, saveSeriesProgress, toggleWatchlist, isInWatchlist } from './ui.js?v=29';
import { fetchTVEpisodeList, fetchTVSeasons, IMAGE_URL } from './api.js?v=29';
import { navigateTo } from './router.js?v=29';

let currentMovieContext = null;

// Extractor Endpoint (Production Safe)
const PROTOCOL = globalThis.location.hostname === 'localhost' ? 'http:' : 'https:';
const PORT = globalThis.location.hostname === 'localhost' ? ':3000' : '';
const STREAMOS_API = `${PROTOCOL}//${globalThis.location.hostname}${PORT}/api/stream`;

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
        DOM.seasonTabs.innerHTML = '<div style="color:#aaa;">Loading Seasons...</div>';
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
                    btn.className = 'nav-tab'; 
                    btn.tabIndex = 0;
                    btn.style.padding = '2px 8px';
                    btn.style.fontSize = '12px';
                    btn.style.borderRadius = '3px';
                    btn.style.height = '22px';
                    btn.style.lineHeight = '1';
                    btn.style.border = '2px solid #555';
                    btn.style.background = s.season_number === targetSeasonNumber ? 'white' : 'rgba(0,0,0,0.7)';
                    btn.style.color = s.season_number === targetSeasonNumber ? 'black' : 'white';
                    btn.style.cursor = 'pointer';
                    btn.innerHTML = `Season ${s.season_number}`;
                    
                    btn.onclick = () => {
                        Array.from(DOM.seasonTabs.children).forEach(c => {
                            c.style.background = 'rgba(0,0,0,0.7)'; c.style.color = 'white';
                        });
                        btn.style.background = 'white'; btn.style.color = 'black';
                        loadEpisodes(movie.id, s.season_number, progress);
                    };
                    btn.onkeydown = (e) => { if(e.key === 'Enter') btn.click(); };
                    DOM.seasonTabs.appendChild(btn);
                    
                    if (s.season_number === targetSeasonNumber) {
                        setTimeout(() => btn.scrollIntoView({ behavior: 'smooth', inline: 'center' }), 100);
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
        DOM.watchlistBtn.style.color = "black";
        DOM.watchlistBtn.style.backgroundColor = 'white';
    } else {
        DOM.watchlistBtn.innerHTML = '<i class="fa-solid fa-plus"></i> WATCHLIST';
        DOM.watchlistBtn.style.color = "white";
        DOM.watchlistBtn.style.backgroundColor = 'rgba(109, 109, 110, 0.7)';
    }
    DOM.watchlistBtn.onclick = () => toggleWatchlist(currentMovieContext, DOM.watchlistBtn);
    
    DOM.playBtn.onclick = () => startScrapingSession(null, null);

    navigateTo('#details');
    setTimeout(() => DOM.playBtn.focus(), 100);
}

async function loadEpisodes(tvId, seasonNum, progressRecord = null) {
    DOM.episodeList.innerHTML = '<div style="color:#aaa;">Loading Episodes...</div>';
    const episodes = await fetchTVEpisodeList(tvId, seasonNum);
    if (episodes && episodes.length > 0) {
        DOM.episodeList.innerHTML = '';
        const progress = progressRecord || getSeriesProgress(tvId);
        let targetEpisodeBtn = null;

        episodes.forEach(e => {
            const btn = document.createElement('div');
            btn.className = 'episode-card nav-tab'; 
            btn.tabIndex = 0;
            btn.style.minWidth = '160px';
            btn.style.maxWidth = '160px';
            btn.style.position = 'relative';
            btn.style.cursor = 'pointer';
            
            const epKey = `s${seasonNum}e${e.episode_number}`;
            const isWatched = progress.watched.includes(epKey);
            
            let imgUrl = e.still_path ? `${IMAGE_URL}${e.still_path}` : 'https://via.placeholder.com/160x90?text=No+Image';
            let checkmarkHtml = isWatched ? `<div style="position:absolute; top:5px; right:5px; background:white; color:#46d369; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.8); font-size:11px; border:2px solid #aaa;"><i class="fa-solid fa-check"></i></div>` : '';
            
            btn.innerHTML = `
                <div style="position:relative; width:100%; height:90px; border-radius:6px; overflow:hidden; border:2px solid #444; margin-bottom:6px; background:#111;">
                    <img loading="lazy" src="${imgUrl}" style="width:100%; height:100%; object-fit:cover;" draggable="false">
                    <div style="position:absolute; bottom:0; padding:2px 4px; background:rgba(0,0,0,0.85); width:100%; font-size:12px; color:white; font-weight:bold;">Ep ${e.episode_number}</div>
                    ${checkmarkHtml}
                </div>
                <div style="font-size:16px; color:white; white-space:normal; line-height:1.2; font-weight:bold;">${e.name || "TBA"}</div>
                <div style="font-size:14px; color:#aaa; margin-top:6px; white-space:normal; line-height:1.3; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">${e.overview || "No description provided by TMDB."}</div>
            `;
            
            btn.onclick = () => {
                DOM.playBtn.innerHTML = `<i class="fa-solid fa-play"></i> RESUME S${seasonNum}:E${e.episode_number}`;
                startScrapingSession(seasonNum, e.episode_number);
            };
            btn.onkeydown = (ev) => { if(ev.key === 'Enter') btn.click(); };
            
            DOM.episodeList.appendChild(btn);

            if (seasonNum === progress.last_season && e.episode_number === progress.last_episode) {
                targetEpisodeBtn = btn;
            }
        });

        setTimeout(() => {
            if (targetEpisodeBtn) targetEpisodeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center' });
        }, 300);
    }
}

async function startScrapingSession(targetS = null, targetE = null) {
    if (!currentMovieContext) return;
    
    // Save to active profile history
    const activeProfileRaw = globalThis.localStorage.getItem('beetv_active_profile');
    const histKey = activeProfileRaw ? `beetv_history_${activeProfileRaw}` : 'beetv_history_default';
    let hList = JSON.parse(globalThis.localStorage.getItem(histKey) || '[]');
    hList = hList.filter(m => m.id !== currentMovieContext.id);
    hList.unshift(currentMovieContext);
    if (hList.length > 25) hList = hList.slice(0, 25);
    globalThis.localStorage.setItem(histKey, JSON.stringify(hList));

    DOM.serverList.innerHTML = '';
    DOM.linksTitle.textContent = `Resolving: ${currentMovieContext.title}`;
    DOM.scraperStatus.classList.remove('hidden');
    DOM.scraperStatus.innerHTML = '<p><i class="fa-solid fa-spinner fa-spin"></i> Proxying remote background extractors natively...</p>';
    
    navigateTo('#links');

    let s = 1, e = 1;
    if (currentMovieContext.type === 'tv') {
        if (targetS !== null && targetE !== null) {
            s = targetS;
            e = targetE;
        } else {
            const progress = getSeriesProgress(currentMovieContext.id);
            s = progress.last_season || 1;
            e = progress.last_episode || 1;
        }
        saveSeriesProgress(currentMovieContext.id, s, e);
    }
    
    try {
        let apiUrl = `${STREAMOS_API}?tmdb=${currentMovieContext.id}&type=${currentMovieContext.type}&title=${encodeURIComponent(currentMovieContext.title)}&year=${currentMovieContext.year}`;
        if (currentMovieContext.type === 'tv') apiUrl += `&season=${s}&episode=${e}`;

        const res = await fetch(apiUrl);
        const data = await res.json();
        
        DOM.scraperStatus.classList.add('hidden');

        if(data.success && data.links && data.links.length > 0) {
            data.links.forEach((link, index) => {
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.className = 'server-btn';
                btn.tabIndex = 0;
                btn.innerHTML = `<i class="fa-solid fa-circle-play" style="color:var(--primary); font-size:36px;"></i> <div><b>Play Link ${index + 1} (${link.server})</b><br><span style="font-size:16px;color:#aaa;">Extracted format: ${link.type.toUpperCase()}</span></div>`;
                
                btn.onclick = () => {
                    if (link.type === 'iframe') {
                        playIframeFallback(link.url);
                    } else {
                        playNativeVideo(link.url);
                    }
                };
                btn.onkeydown = (ev) => { if(ev.key === 'Enter') btn.click(); };
                
                li.appendChild(btn);
                DOM.serverList.appendChild(li);
                if (index === 0) btn.focus();
            });
        } else {
            DOM.scraperStatus.classList.remove('hidden');
            DOM.scraperStatus.innerHTML = '<div style="color:var(--primary);"><i class="fa-solid fa-triangle-exclamation"></i> Extraction failed. Node proxy returned empty payload.</div>';
        }
    } catch (err) {
        console.error("Stream extraction failed:", err);
        DOM.scraperStatus.classList.remove('hidden');
        DOM.scraperStatus.innerHTML = `<div style="color:var(--primary);"><i class="fa-solid fa-triangle-exclamation"></i> Extraction Error. StreamOS Express Backend Unreachable.</div>`;
    }
}

function playIframeFallback(iframeUrl) {
    DOM.videoPlayer.style.display = 'none';
    if (!DOM.videoPlayer.paused) DOM.videoPlayer.pause();
    
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
        iframe.style.borderRadius = '12px';
        iframe.style.background = '#000';
        iframe.allowFullscreen = true;
        iframe.setAttribute('allow', 'fullscreen; encrypted-media');
        DOM.iframeWrapper.appendChild(iframe);
    }
    
    iframe.src = iframeUrl;
    iframe.style.display = 'block';
    
    navigateTo('#player');
}

function playNativeVideo(streamUrl) {
    let iframe = document.getElementById('fallback-iframe');
    if (iframe) iframe.style.display = 'none';
    DOM.videoPlayer.style.display = 'block';
    navigateTo('#player');
    
    DOM.videoPlayer.muted = false;
    DOM.videoPlayer.volume = 1.0;

    const isM3U8 = streamUrl.includes('.m3u8');
    const canPlayNativeHLS = DOM.videoPlayer.canPlayType('application/vnd.apple.mpegurl');

    if (isM3U8 && !canPlayNativeHLS && globalThis.Hls && Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(DOM.videoPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            DOM.videoPlayer.play().catch(e => console.warn(e));
        });
    } else {
        DOM.videoPlayer.src = streamUrl;
        DOM.videoPlayer.addEventListener('loadedmetadata', function() {
            DOM.videoPlayer.play().catch(e => console.warn("Autoplay block:", e));
        }, {once: true});
    }
    
    // Auto Play Next episode feature
    if(currentMovieContext && currentMovieContext.type === 'tv') {
        DOM.videoPlayer.addEventListener('ended', playNextEpisode, {once: true});
    }
}

function playNextEpisode() {
    // Basic binge tracking hook.
    // Real implementation would look into the next `s` and `e` from progress and restart the scraper natively.
    console.log("Next episode triggered!");
    DOM.playerBackBtn.click(); // Backs out to Links View or Details view securely.
}

if (DOM.playerBackBtn) {
    DOM.playerBackBtn.addEventListener('click', () => {
        globalThis.history.back();
    });
}

if (DOM.playerFullscreenBtn) {
    DOM.playerFullscreenBtn.addEventListener('click', () => {
        let elem = document.getElementById('fallback-iframe') || DOM.videoPlayer;
        if (elem && elem.style.display !== 'none') {
            if (elem.requestFullscreen) elem.requestFullscreen();
            else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
        }
    });
}
