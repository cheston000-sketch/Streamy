import { DOM, isInWatchlist, toggleWatchlist } from './ui.js?v=5';
import { fetchTVSeasons } from './api.js?v=5';

export let currentServerIndex = 0; // Default to VidSrc
let currentPlayingItem = null;

export const SERVERS = [
    { name: 'VidSrc (Primary)', getMovieUrl: (id) => `https://vidsrc.me/embed/movie?tmdb=${id}`, getTvUrl: (id, s, e) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}` },
    { name: 'VidLink (Ad-Free)', getMovieUrl: (id) => `https://vidlink.pro/movie/${id}`, getTvUrl: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}` },
    { name: 'SuperEmbed (Minimal Ads)', getMovieUrl: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`, getTvUrl: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
    { name: 'Embed.su (Backup)', getMovieUrl: (id) => `https://embed.su/embed/movie/${id}`, getTvUrl: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}` }
];

export async function updateVideoSource() {
    if (!currentPlayingItem) return;
    const type = currentPlayingItem.media_type || (currentPlayingItem.name ? 'tv' : 'movie');
    const title = currentPlayingItem.title || currentPlayingItem.name;
    const year = (currentPlayingItem.release_date || currentPlayingItem.first_air_date || '2026').substring(0,4);
    
    let url = `http://${globalThis.location.hostname}:3000/api/stream?tmdb=${currentPlayingItem.id}&type=${type}&title=${encodeURIComponent(title)}&year=${year}`;
    let s = 1, e = 1;
    if (type === 'tv') {
        s = DOM.seasonSelect.value || 1;
        e = DOM.episodeSelect.value || 1;
        url += `&season=${s}&episode=${e}`;
    }

    const fallbackIframe = type === 'tv' ? SERVERS[currentServerIndex].getTvUrl(currentPlayingItem.id, s, e) : SERVERS[currentServerIndex].getMovieUrl(currentPlayingItem.id);

    // Show loading state
    DOM.videoPlayer.style.display = 'none';
    let overlay = document.getElementById('iframe-activation-overlay') || document.createElement('div');
    if (!overlay.id) {
        overlay.id = 'iframe-activation-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0,0,0,0.85)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '999999';
        DOM.iframeWrapper.appendChild(overlay);
    }
    overlay.innerHTML = `<h2 style="color:white;"><i class="fa-solid fa-spinner fa-spin"></i> Locating Stream Matrix...</h2>`;
    overlay.style.display = 'flex';

    // Strict Timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
        let apiUrl = `http://192.168.4.65:3000/api/stream?tmdb=${id}&type=${type}&title=${encodeURIComponent(DOM.playerTitle.textContent)}&year=2024`;
        if (type === 'tv' || type === 'show') apiUrl += `&season=${season}&episode=${episode}`;

        const res = await fetch(apiUrl);
        const data = await res.json();
        
        sourceList.innerHTML = ""; // Clear loader

        if(data.success && data.links && data.links.length > 0) {
            data.links.forEach((link, index) => {
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.className = 'btn-primary';
                btn.style.width = '100%';
                btn.style.justifyContent = 'flex-start';
                btn.style.padding = '1.2rem';
                btn.style.fontSize = '1.1rem';
                btn.innerHTML = `<i class="fa-solid fa-play"></i> Play Server ${index + 1} (${link.server})`;
                
                btn.onclick = () => {
                    const mimeType = link.type === 'hls' ? 'application/x-mpegURL' : 'video/mp4';
                    if (globalThis.__STREAMY_NATIVE__ && globalThis.StreamyPlayer) {
                        // Pass directly to Android Native Intent Chooser
                        globalThis.StreamyPlayer.playStream(link.url, mimeType, DOM.playerTitle.textContent);
                    } else {
                        alert("BeeTV Native Player Intent only works in the Fire TV App!");
                        window.open(link.url, '_blank');
                    }
                };
                
                li.appendChild(btn);
                sourceList.appendChild(li);
            });
        } else {
            sourceList.innerHTML = '<li style="color:var(--red);"><i class="fa-solid fa-triangle-exclamation"></i> No raw streams found. Cloudflare blocked the extractor.</li>';
        }
    } catch (err) {
        console.error("Stream extraction failed:", err);
        sourceList.innerHTML = '<li style="color:var(--red);">Extraction Error: Ensure StreamOS server is running on 192.168.4.65:3000</li>';
    }
}

export function switchServer(index) {
    currentServerIndex = index;
    updateVideoSource();
}

export function cycleServer() {
    currentServerIndex = (currentServerIndex + 1) % SERVERS.length;
    if (DOM.tvServerBtn) {
        DOM.tvServerBtn.innerHTML = `<i class="fa-solid fa-server"></i> ${SERVERS[currentServerIndex].name.split(' ')[0].toUpperCase()}`;
    }
    updateVideoSource();
}

function playIframeFallback(iframeUrl) {
    DOM.videoPlayer.style.display = 'none';
    if (DOM.videoPlayer.pause) DOM.videoPlayer.pause();
    
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
        iframe.style.borderRadius = '8px';
        iframe.style.background = '#000';
        iframe.allowFullscreen = true;
        iframe.setAttribute('allow', 'fullscreen; encrypted-media');
        DOM.iframeWrapper.appendChild(iframe);
    }
    
    let overlay = document.getElementById('iframe-activation-overlay');
    // Clear the loading text and display the button
    overlay.innerHTML = '';
        
    let startBtn = document.createElement('button');
    startBtn.innerHTML = '<i class="fa-solid fa-play"></i> START STREAM (PRESS SELECT)';
    startBtn.style.padding = '25px 40px';
    startBtn.style.fontSize = '2rem';
    startBtn.style.fontWeight = '800';
    startBtn.style.background = '#8A2BE2';
    startBtn.style.color = '#fff';
    startBtn.style.border = '4px solid transparent';
    startBtn.style.borderRadius = '12px';
    startBtn.style.cursor = 'pointer';
    startBtn.style.boxShadow = '0 10px 30px rgba(138,43,226,0.6)';
    startBtn.tabIndex = 0; // Make D-Pad Focusable natively
    
    // Ensure visual focus
    startBtn.addEventListener('focus', () => startBtn.style.border = '4px solid #fff');
    startBtn.addEventListener('blur', () => startBtn.style.border = '4px solid transparent');
    
    let helpText = document.createElement('div');
    helpText.innerText = "Click to authenticate TV hardware decoder";
    helpText.style.color = '#aaa';
    helpText.style.marginTop = '15px';
    helpText.style.fontSize = '1.2rem';
    
    overlay.appendChild(startBtn);
    overlay.appendChild(helpText);
    
    startBtn.onclick = () => {
        iframe.src = overlay.getAttribute('data-src');
        overlay.style.display = 'none';
        if (DOM.tvFullscreenBtn) DOM.tvFullscreenBtn.focus();
    };
    
    startBtn.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            startBtn.click();
        }
    });
    
    // Clear old src to prevent rogue autoplay ghosts if switching servers rapidly
    iframe.removeAttribute('src'); 
    
    overlay.setAttribute('data-src', iframeUrl);
    overlay.style.display = 'flex';
    iframe.style.display = 'block';
    
    // Auto-focus the overlay button for TV Remotes
    setTimeout(() => {
        let btn = overlay.querySelector('button');
        if(btn) btn.focus();
    }, 300);
}

function playNativeVideo(streamUrl, fallbackUrl) {
    let overlay = document.getElementById('iframe-activation-overlay');
    if (overlay) overlay.style.display = 'none';
    let iframe = document.getElementById('fallback-iframe');
    if (iframe) iframe.style.display = 'none';
    DOM.videoPlayer.style.display = 'block';
    
    // Explicitly override browser audio retention
    DOM.videoPlayer.muted = false;
    DOM.videoPlayer.volume = 1.0;

    // Auto-fallback system if the video track is missing (HEVC decoding failure on Android)
    const handleVideoFallback = () => {
        setTimeout(() => {
            if (DOM.videoPlayer.videoWidth === 0 && fallbackUrl) {
                console.warn("Hardware codec failure: Video track missing. Aborting and falling back to iframe.");
                DOM.videoPlayer.pause();
                DOM.videoPlayer.removeAttribute('src');
                DOM.videoPlayer.load();
                DOM.videoPlayer.style.display = 'none';
                playIframeFallback(fallbackUrl);
            }
        }, 3000); // give it 3 seconds to decode the first keyframe
    };

    let nativeDecodeTimeout;
    const clearNativeTimeout = () => clearTimeout(nativeDecodeTimeout);

    DOM.videoPlayer.addEventListener('loadedmetadata', () => {
        clearNativeTimeout();
        DOM.videoPlayer.muted = false;
        DOM.videoPlayer.volume = 1.0;
        handleVideoFallback();
    }, { once: true });

    DOM.videoPlayer.addEventListener('error', function() {
        clearNativeTimeout();
        if (fallbackUrl) {
            console.warn("Video thrown error. Falling back.");
            playIframeFallback(fallbackUrl);
        }
    }, { once: true });
    
    // Strict 5.5 second timeout: If the video takes too long to even trigger metadata, abort and fallback.
    nativeDecodeTimeout = setTimeout(() => {
        console.warn("Native video decode stall detected. Forcing Iframe Fallback.");
        if (fallbackUrl) playIframeFallback(fallbackUrl);
    }, 5500);

    const isM3U8 = streamUrl.includes('.m3u8');
    const canPlayNativeHLS = DOM.videoPlayer.canPlayType('application/vnd.apple.mpegurl');

    if (isM3U8 && !canPlayNativeHLS && globalThis.Hls && Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(DOM.videoPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            DOM.videoPlayer.play().catch(e => console.warn(e));
        });
        DOM.videoPlayer.addEventListener('playing', handleVideoFallback, { once: true });
    } else {
        // Raw MP4s or Native HLS Support
        DOM.videoPlayer.src = streamUrl;
        
        let playAttempted = false;
        DOM.videoPlayer.addEventListener('canplay', function() {
            if (!playAttempted) {
                playAttempted = true;
                DOM.videoPlayer.play().catch(e => console.warn("Autoplay block:", e));
            }
        });
        
        DOM.videoPlayer.addEventListener('loadedmetadata', function() {
            DOM.videoPlayer.play().catch(e => console.warn("Autoplay block:", e));
        });

        DOM.videoPlayer.addEventListener('playing', handleVideoFallback, { once: true });
        
        // Also fallback instantly on error
        DOM.videoPlayer.addEventListener('error', function() {
            if (fallbackUrl) {
                console.warn("Video thrown error. Falling back.");
                playIframeFallback(fallbackUrl);
            }
        }, { once: true });
    }
}

export function updateEpisodesDropdown(count) {
    DOM.episodeSelect.innerHTML = '';
    for(let i=1; i<=count; i++) {
        const opt = document.createElement('option');
        opt.value = opt.innerText = i;
        DOM.episodeSelect.appendChild(opt);
    }
}

export async function openPlayer(item) {
    const type = item.media_type || (item.name ? 'tv' : 'movie');
    const title = item.title || item.name;
    const year = (item.release_date || item.first_air_date || '').substring(0,4);
    
    currentPlayingItem = item;
    DOM.playerTitle.innerText = `${title} (${year})`;

    if (DOM.playerWatchlistBtn) {
        const inList = isInWatchlist(item.id);
        DOM.playerWatchlistBtn.innerHTML = inList ? '<i class="fa-solid fa-check"></i> Added' : '<i class="fa-solid fa-plus"></i> Add to List';
        if (inList) DOM.playerWatchlistBtn.classList.add('added');
        else DOM.playerWatchlistBtn.classList.remove('added');
        
        DOM.playerWatchlistBtn.onclick = () => {
            toggleWatchlist(currentPlayingItem, DOM.playerWatchlistBtn, true);
        };
    }

    // Save to LocalStorage History
    let history = JSON.parse(globalThis.localStorage.getItem('streamy_history') || '[]');
    history = history.filter(h => h.id !== item.id); // remove duplicates
    history.unshift(item);
    globalThis.localStorage.setItem('streamy_history', JSON.stringify(history.slice(0, 20))); // cap at 20

    if (type === 'tv') {
        DOM.tvControls.classList.remove('hidden');
        const seasons = await fetchTVSeasons(item.id);
        
        DOM.seasonSelect.innerHTML = '';
        seasons.forEach(s => {
            if(s.season_number > 0) {
                const opt = document.createElement('option');
                opt.value = opt.innerText = s.season_number;
                DOM.seasonSelect.appendChild(opt);
            }
        });
        
        updateEpisodesDropdown(seasons[0] ? seasons[0].episode_count : 1);
        
        DOM.seasonSelect.onchange = () => {
            const selectedSeason = seasons.find(x => x.season_number == DOM.seasonSelect.value);
            if(selectedSeason) updateEpisodesDropdown(selectedSeason.episode_count);
        };

        DOM.loadEpisodeBtn.onclick = () => {
            updateVideoSource();
        }
    } else {
        DOM.tvControls.classList.add('hidden');
    }

    updateVideoSource(); 
    
    // Proper hash routing triggers navigation!
    globalThis.location.hash = `#player`;
    globalThis.scrollTo({ top: 0, behavior: 'smooth' });
}

// High-Performance Custom Volume OSD
let osdTimeout;
function showOSD(iconClass, text) {
    let osd = document.getElementById('tv-osd');
    if (!osd) {
        osd = document.createElement('div');
        osd.id = 'tv-osd';
        osd.style.position = 'fixed';
        osd.style.top = '10%';
        osd.style.right = '5%';
        osd.style.background = 'rgba(0,0,0,0.85)';
        osd.style.color = 'white';
        osd.style.padding = '15px 30px';
        osd.style.borderRadius = '12px';
        osd.style.zIndex = '9999999';
        osd.style.fontSize = '2.5rem';
        osd.style.fontWeight = '800';
        osd.style.boxShadow = '0 10px 40px rgba(138,43,226,0.6)';
        osd.style.display = 'flex';
        osd.style.alignItems = 'center';
        osd.style.gap = '20px';
        osd.style.transition = 'opacity 0.2s';
        document.body.appendChild(osd);
    }
    osd.innerHTML = `<i class="fa-solid ${iconClass}" style="color:#8A2BE2;"></i> <span>${text}</span>`;
    osd.style.display = 'flex';
    osd.style.opacity = '1';
    
    if (osdTimeout) clearTimeout(osdTimeout);
    osdTimeout = setTimeout(() => {
        osd.style.opacity = '0';
        setTimeout(() => { if (osd.style.opacity === '0') osd.style.display = 'none'; }, 200);
    }, 2000);
}

// Global D-Pad Media Interceptors (For Remotes with broken IR)
globalThis.addEventListener('keydown', (e) => {
    if (!currentPlayingItem) return;
    
    // Only map if the Native Video Player is rendering on screen (Iframe blocks cross-origin scripts)
    if (DOM.videoPlayer && DOM.videoPlayer.style.display !== 'none') {
        const isFullscreen = document.fullscreenElement !== null;
        
        if (e.key === 'ArrowUp' || e.key === 'VolumeUp') {
            if (isFullscreen || !DOM.videoPlayer.paused) e.preventDefault();
            let newVol = DOM.videoPlayer.volume + 0.1;
            DOM.videoPlayer.volume = Math.min(newVol, 1.0);
            DOM.videoPlayer.muted = false;
            const icon = DOM.videoPlayer.volume > 0.5 ? 'fa-volume-high' : 'fa-volume-low';
            showOSD(icon, `${Math.round(DOM.videoPlayer.volume * 100)}%`);
        }
        else if (e.key === 'ArrowDown' || e.key === 'VolumeDown') {
            if (isFullscreen || !DOM.videoPlayer.paused) e.preventDefault();
            let newVol = DOM.videoPlayer.volume - 0.1;
            DOM.videoPlayer.volume = Math.max(newVol, 0.0);
            if (DOM.videoPlayer.volume === 0) DOM.videoPlayer.muted = true;
            const icon = DOM.videoPlayer.volume > 0 ? 'fa-volume-low' : 'fa-volume-xmark';
            showOSD(icon, `${Math.round(DOM.videoPlayer.volume * 100)}%`);
        }
    }
});

// Global Setup logic
if (DOM.tvFullscreenBtn) {
    DOM.tvFullscreenBtn.addEventListener('click', () => {
        let elem = document.getElementById('fallback-iframe');
        if (!elem || elem.style.display === 'none') {
            elem = DOM.videoPlayer;
        }
        if (elem) {
            if (elem.requestFullscreen) elem.requestFullscreen();
            else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
            else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
        }
    });
}
