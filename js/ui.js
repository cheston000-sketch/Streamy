import { IMAGE_URL, BACKDROP_URL } from './api.js?v=29';

export const DOM = {
    topBar: document.getElementById('top-bar'),
    navTabs: document.querySelectorAll('.nav-tab[data-view]'),
    genreFilter: document.getElementById('genre-filter'),
    
    // Views
    viewHome: document.getElementById('view-home'),
    heroBanner: document.getElementById('hero-banner'),
    heroTitle: document.getElementById('hero-title'),
    heroMeta: document.getElementById('hero-meta'),
    heroDesc: document.getElementById('hero-desc'),
    rowsContainer: document.getElementById('rows-container'),
    
    viewCategory: document.getElementById('view-category'),
    viewCategoryTitle: document.getElementById('category-title'),
    categoryGrid: document.getElementById('category-grid'),
    categoryLoadMore: document.getElementById('category-load-more'),
    
    viewSearch: document.getElementById('view-search'),
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    searchGrid: document.getElementById('search-grid'),
    
    settingsTab: document.getElementById('settings-tab'),
    viewSettings: document.getElementById('view-settings'),
    settingClearCache: document.getElementById('setting-clear-cache'),
    settingManageProfiles: document.getElementById('setting-manage-profiles'),
    
    viewDetails: document.getElementById('view-details'),
    detBackdrop: document.getElementById('details-backdrop'),
    detPoster: document.getElementById('details-poster'),
    detTitle: document.getElementById('details-title'),
    detMeta: document.getElementById('details-meta'),
    detDesc: document.getElementById('details-desc'),
    tvControls: document.getElementById('tv-controls'),
    seasonTabs: document.getElementById('season-tabs'),
    episodeList: document.getElementById('episode-list'),
    playBtn: document.getElementById('play-btn'),
    watchlistBtn: document.getElementById('watchlist-btn'),
    
    viewLinks: document.getElementById('view-links'),
    linksTitle: document.getElementById('links-title'),
    scraperStatus: document.getElementById('scraper-status'),
    serverList: document.getElementById('server-list'),
    
    // Web Player
    viewPlayer: document.getElementById('view-player'),
    videoPlayer: document.getElementById('video-player'),
    playerBackBtn: document.getElementById('player-back-btn'),
    playerFullscreenBtn: document.getElementById('player-fullscreen-btn'),
    playerServerCycleBtn: document.getElementById('player-server-cycle-btn'),
    iframeWrapper: document.querySelector('.player-container'),

    // Music
    viewMusic: document.getElementById('view-music'),
    musicRowsContainer: document.getElementById('music-rows-container'),
    musicSearchInput: document.getElementById('music-search-input'),
    addMusicCategoryBtn: document.getElementById('add-music-category-btn')
};

export let cachedBackdrops = {};
export function normalizeItem(item, typeFallback) {
    let type = item.media_type || item.type || typeFallback;
    let isMusic = type === 'music' || type === 'deezer' || type === 'track';
    let title = item.title || item.name;
    let artist = item.artist?.name || item.artistName || item.artist || "";
    let releaseStr = item.release_date || item.first_air_date || item.year || "";
    
    let posterPath = item.poster_path ? `${IMAGE_URL}${item.poster_path}` : (item.poster || null);
    if (isMusic && !posterPath) {
        // Use the Tidal image proxy logic if needed
        const coverUuid = item.album?.cover || item.cover || item.thumbnail;
        if (coverUuid && typeof coverUuid === 'string' && coverUuid.includes('-')) {
            posterPath = `https://resources.tidal.com/images/${coverUuid.replaceAll('-', '/')}/640x640.jpg`;
        } else {
            posterPath = coverUuid || `https://via.placeholder.com/600x600?text=${encodeURIComponent(title)}`;
        }
    }

    let backdropPath = item.backdrop_path ? `${BACKDROP_URL}${item.backdrop_path}` : (item.backdrop || null);
    let descText = item.overview || item.desc || (isMusic ? `Track by ${artist}` : "No comprehensive description natively available.");
    let ratingText = item.vote_average ? `${item.vote_average.toFixed(1)} / 10 Match` : (item.rating || (isMusic ? 'Hi-Fi' : 'New'));
    
    return {
        id: item.id || item.tmdbId || item.trackId,
        type: isMusic ? 'music' : type,
        title: title,
        artist: artist,
        year: String(releaseStr).split('-')[0] || "2024",
        poster: posterPath,
        backdrop: backdropPath,
        desc: descText,
        rating: ratingText,
        vote_average: item.vote_average
    };
}

export function updateHeroBanner(movie) {
    if (movie.backdrop && movie.backdrop !== 'none' && cachedBackdrops[movie.id] !== movie.backdrop) {
        DOM.heroBanner.style.backgroundImage = `url('${movie.backdrop}')`;
        cachedBackdrops[movie.id] = movie.backdrop;
    }
    DOM.heroTitle.textContent = movie.title;
    DOM.heroDesc.textContent = movie.desc;
    DOM.heroMeta.textContent = `${movie.year} • ${movie.type.toUpperCase()} • ${movie.rating}`;
}

export function enableDragScroll(slider) {
    let isDown = false;
    let startX;
    let scrollLeft;
    let isDragging = false;
    let animationFrame;

    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        isDragging = false;
        slider.classList.add('drag-active');
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
        cancelAnimationFrame(animationFrame);
    });

    slider.addEventListener('mouseleave', () => {
        isDown = false;
        slider.classList.remove('drag-active');
        slider.classList.remove('dragging');
        cancelAnimationFrame(animationFrame);
    });

    slider.addEventListener('mouseup', () => {
        isDown = false;
        slider.classList.remove('drag-active');
        setTimeout(() => slider.classList.remove('dragging'), 50);
        cancelAnimationFrame(animationFrame);
    });

    slider.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - slider.offsetLeft;
        const walk = (x - startX) * 2; 
        
        if (Math.abs(walk) > 10) {
            isDragging = true;
            slider.classList.add('dragging');
        }
        
        cancelAnimationFrame(animationFrame);
        animationFrame = requestAnimationFrame(() => {
            slider.scrollLeft = scrollLeft - walk;
        });
    });
    
    slider.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaX) === 0 && e.deltaY !== 0) {
            e.preventDefault();
            try { 
                slider.scrollBy({ left: e.deltaY > 0 ? 300 : -300, behavior: 'smooth' }); 
            } catch(e) {}
        }
    }, {passive: false});
}

export function buildRow(title, items, isWatchlistDict, typeFallback, isFirstRow, categoryVal, onCardClick, onViewAllClick) {
    if(!DOM.rowsContainer) return;
    
    const rowDiv = document.createElement('div');
    rowDiv.className = 'content-row';
    rowDiv.innerHTML = `<h2 class="row-header">${title}</h2>`;
    
    const slider = document.createElement('div');
    slider.className = 'row-posters';
    enableDragScroll(slider);
    
    items.forEach((item, index) => {
        let parsed = isWatchlistDict ? item : normalizeItem(item, typeFallback);
        if (!parsed.poster || parsed.poster === 'null') return;

        const card = document.createElement('div');
        card.className = 'poster-card';
        card.tabIndex = 0;
        
        let progressHtml = ''; // Can implement later via localStorage progress
        card.innerHTML = `<img loading="lazy" src="${parsed.poster}" alt="${parsed.title}" draggable="false">${progressHtml}`;
        
        card.addEventListener('focus', () => updateHeroBanner(parsed));
        
        // Mouse hover acts like D-Pad focus
        card.addEventListener('mouseenter', () => {
             card.focus();
             updateHeroBanner(parsed);
        });
        
        card.onclick = () => onCardClick(parsed);
        card.onkeydown = (e) => { if(e.key === 'Enter') card.click(); };
        
        if (isFirstRow && index === 0) {
            setTimeout(() => card.focus(), 300);
        }
        
        slider.appendChild(card);
    });

    if (categoryVal && categoryVal !== 'watchlist') {
        const showAll = document.createElement('div');
        showAll.className = 'poster-card show-all-card';
        showAll.tabIndex = 0;
        showAll.innerHTML = `<i class="fa-solid fa-arrow-right"></i><span>View All</span>`;
        showAll.onclick = () => onViewAllClick(title, categoryVal, typeFallback);
        showAll.onkeydown = (e) => { if(e.key === 'Enter') showAll.click(); };
        slider.appendChild(showAll);
    }

    rowDiv.appendChild(slider);
    DOM.rowsContainer.appendChild(rowDiv);
}

export function renderGridItems(items, container, typeFallback, onCardClick) {
    container.innerHTML = '';
    items.forEach(item => {
        let parsed = normalizeItem(item, typeFallback);
        if (!parsed.poster || parsed.poster === 'null') return;

        const card = document.createElement('div');
        card.className = 'poster-card';
        card.tabIndex = 0;
        
        card.innerHTML = `<img loading="lazy" src="${parsed.poster}" alt="${parsed.title}" draggable="false">`;
        
        card.onclick = () => onCardClick(parsed);
        card.onkeydown = (e) => { if(e.key === 'Enter') card.click(); };
        container.appendChild(card);
    });
}

// Watchlist Helpers
export function isInWatchlist(id) {
    const activeProfileRaw = globalThis.localStorage.getItem('beetv_active_profile');
    const watchKey = activeProfileRaw ? `beetv_watchlist_${activeProfileRaw}` : 'beetv_watchlist_default';
    const list = JSON.parse(globalThis.localStorage.getItem(watchKey) || '[]');
    return list.some(x => x.id === id);
}

export function toggleWatchlist(item, btnElement) {
    const activeProfileRaw = globalThis.localStorage.getItem('beetv_active_profile');
    const watchKey = activeProfileRaw ? `beetv_watchlist_${activeProfileRaw}` : 'beetv_watchlist_default';
    let list = JSON.parse(globalThis.localStorage.getItem(watchKey) || '[]');
    const index = list.findIndex(x => x.id === item.id);
    if (index > -1) {
        list.splice(index, 1);
        if(btnElement) {
            btnElement.innerHTML = '<i class="fa-solid fa-plus"></i> WATCHLIST';
            btnElement.style.color = "white";
            btnElement.style.backgroundColor = 'rgba(109, 109, 110, 0.7)';
        }
    } else {
        list.push(item);
        if(btnElement) {
            btnElement.innerHTML = '<i class="fa-solid fa-check"></i> ON WATCHLIST';
            btnElement.style.color = "black";
            btnElement.style.backgroundColor = 'white';
        }
    }
    globalThis.localStorage.setItem(watchKey, JSON.stringify(list));
    globalThis.dispatchEvent(new Event('watchlist-updated'));
}

export function getSeriesProgress(tmdbId) {
    const activeProfileRaw = globalThis.localStorage.getItem('beetv_active_profile');
    const key = `beetv_series_progress_${activeProfileRaw || 'default'}`;
    const db = JSON.parse(localStorage.getItem(key) || '{}');
    return db[tmdbId] || { last_season: 1, last_episode: 1, watched: [] };
}

export function saveSeriesProgress(tmdbId, s, e) {
    const activeProfileRaw = globalThis.localStorage.getItem('beetv_active_profile');
    const key = `beetv_series_progress_${activeProfileRaw || 'default'}`;
    const db = JSON.parse(localStorage.getItem(key) || '{}');
    if (!db[tmdbId]) db[tmdbId] = { watched: [] };
    db[tmdbId].last_season = parseInt(s);
    db[tmdbId].last_episode = parseInt(e);
    const epKey = `s${s}e${e}`;
    if (!db[tmdbId].watched.includes(epKey)) db[tmdbId].watched.push(epKey);
    localStorage.setItem(key, JSON.stringify(db));
}

// MUSIC UI
import { MusicState, playTrack } from './music.js';
import { fetchMusicChart, searchMusic } from './api.js';

export async function renderMusicView(query = '') {
    if (!DOM.musicRowsContainer) return;
    DOM.musicRowsContainer.innerHTML = '';

    if (query) {
        const results = await searchMusic(query);
        const tracks = results?.data?.items || [];
        buildMusicRow(`Search Results for "${query}"`, tracks, true);
        return;
    }

    // Default discovery rows
    for (const cat of MusicState.categories) {
        const result = await fetchMusicChart(cat.id, cat.type);
        const tracks = result?.data || result?.tracks?.data || [];
        if (tracks.length > 0) {
            buildMusicRow(cat.title, tracks);
        }
    }

    if (MusicState.recent.length > 0) {
        buildMusicRow("Recently Played", MusicState.recent);
    }
}

export function buildMusicRow(title, items, isFirstRow = false) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'content-row';
    rowDiv.innerHTML = `<h2 class="row-header">${title}</h2>`;
    
    const slider = document.createElement('div');
    slider.className = 'row-posters';
    enableDragScroll(slider);
    
    items.forEach((item, index) => {
        const parsed = normalizeItem(item, 'music');
        const card = createMusicCard(parsed, items);
        
        if (isFirstRow && index === 0) {
            setTimeout(() => card.focus(), 300);
        }
        
        slider.appendChild(card);
    });

    rowDiv.appendChild(slider);
    DOM.musicRowsContainer.appendChild(rowDiv);
}

export function createMusicCard(item, queue) {
    const card = document.createElement('div');
    card.className = 'poster-card music-card';
    card.tabIndex = 0;
    
    card.innerHTML = `
        <img loading="lazy" src="${item.poster}" alt="${item.title}" draggable="false">
        <div class="card-info" style="position: absolute; bottom: 0; left: 0; right: 0; padding: 10px; background: linear-gradient(to top, black, transparent); display: none;">
            <div style="font-weight: bold; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.title}</div>
            <div style="font-size: 0.8rem; color: #aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.artist}</div>
        </div>
    `;

    card.addEventListener('focus', () => {
        // Optional: show track info or update a music hero
        const heroTitle = document.getElementById('music-hero-title');
        const heroDesc = document.getElementById('music-hero-desc');
        const heroBanner = document.getElementById('music-hero-banner');
        if (heroTitle) heroTitle.textContent = item.title;
        if (heroDesc) heroDesc.textContent = item.artist;
        if (heroBanner && item.poster) heroBanner.style.backgroundImage = `url('${item.poster}')`;
    });

    card.onclick = () => playTrack(item, queue);
    card.onkeydown = (e) => { if(e.key === 'Enter') card.click(); };
    
    return card;
}

// Search debouncing
let musicSearchTimer;
if (DOM.musicSearchInput) {
    DOM.musicSearchInput.addEventListener('input', (e) => {
        clearTimeout(musicSearchTimer);
        musicSearchTimer = setTimeout(() => {
            renderMusicView(e.target.value.trim());
        }, 600);
    });
}
