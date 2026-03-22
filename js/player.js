import { DOM, isInWatchlist, toggleWatchlist } from './ui.js?v=5';
import { fetchTVSeasons } from './api.js?v=5';

let currentServerIndex = 1; // Default to VidLink (ad-free) for the fallback!
let currentPlayingItem = null;

const SERVERS = [
    { name: 'VidSrc (Primary)', getMovieUrl: (id) => `https://vidsrc.me/embed/movie?tmdb=${id}&autoplay=false`, getTvUrl: (id, s, e) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}&autoplay=false` },
    { name: 'VidLink (Ad-Free)', getMovieUrl: (id) => `https://vidlink.pro/movie/${id}?autoplay=false`, getTvUrl: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}?autoplay=false` },
    { name: 'SuperEmbed (Minimal Ads)', getMovieUrl: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1&autoplay=false`, getTvUrl: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}&autoplay=false` },
    { name: 'Embed.su (Backup)', getMovieUrl: (id) => `https://embed.su/embed/movie/${id}&autoplay=false`, getTvUrl: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}&autoplay=false` }
];

export async function updateVideoSource() {
    if (!currentPlayingItem) return;
    const type = currentPlayingItem.media_type || (currentPlayingItem.name ? 'tv' : 'movie');
    const title = currentPlayingItem.title || currentPlayingItem.name;
    const year = (currentPlayingItem.release_date || currentPlayingItem.first_air_date || '2026').substring(0,4);
    
    let url = `/api/stream?tmdb=${currentPlayingItem.id}&type=${type}&title=${encodeURIComponent(title)}&year=${year}`;
    let s = 1, e = 1;
    if (type === 'tv') {
        s = DOM.seasonSelect.value || 1;
        e = DOM.episodeSelect.value || 1;
        url += `&season=${s}&episode=${e}`;
    }

    const fallbackIframe = type === 'tv' ? SERVERS[currentServerIndex].getTvUrl(currentPlayingItem.id, s, e) : SERVERS[currentServerIndex].getMovieUrl(currentPlayingItem.id);

    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if(data.success && data.url) {
            playNativeVideo(data.url);
        } else {
            console.warn("Backend extractor blocked by Cloudflare. Engaging hybrid Iframe fallback.");
            playIframeFallback(fallbackIframe);
        }
    } catch(err) {
        console.error("Backend connection failed.", err);
        playIframeFallback(fallbackIframe);
    }
}

export function switchServer(index) {
    currentServerIndex = index;
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
    iframe.src = iframeUrl;
    iframe.style.display = 'block';
}

function playNativeVideo(streamUrl) {
    let iframe = document.getElementById('fallback-iframe');
    if (iframe) iframe.style.display = 'none';
    DOM.videoPlayer.style.display = 'block';
    
    // Explicitly override browser audio retention
    DOM.videoPlayer.muted = false;
    DOM.videoPlayer.volume = 1.0;

    if (globalThis.Hls && Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(DOM.videoPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            DOM.videoPlayer.play();
        });
    } else if (DOM.videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        // Native support (Safari)
        DOM.videoPlayer.src = streamUrl;
        DOM.videoPlayer.addEventListener('loadedmetadata', function() {
            DOM.videoPlayer.play();
        });
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
