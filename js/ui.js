import { IMAGE_URL, BACKDROP_URL, fetchMusicChart, searchMusic, searchMusicSaavn } from './api.js?v=41';
import { MusicState, playTrack } from './music.js?v=41';

export const DOM = {
    topBar: document.getElementById('side-bar'),
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
    musicSearchBtn: document.getElementById('music-search-btn'),
    addMusicCategoryBtn: document.getElementById('add-music-category-btn')
};

export let cachedBackdrops = {};
export function normalizeItem(item, typeFallback) {
    let type = item.media_type || item.type || typeFallback;
    let isMusic = type === 'music' || type === 'deezer' || type === 'track';
    let title = item.title || item.name;
    let artist = item.artist?.name || item.artistName || (typeof item.artist === 'string' ? item.artist : "") || "";
    let releaseStr = item.release_date || item.first_air_date || item.year || "";
    
    let posterPath = item.poster_path ? `${IMAGE_URL}${item.poster_path}` : (item.poster || null);
    if (!posterPath) {
        // Use the Tidal image proxy logic if needed
        const coverUuid = item.album?.cover || item.cover || item.thumbnail;
        if (coverUuid && typeof coverUuid === 'string' && coverUuid.includes('-')) {
            posterPath = `https://resources.tidal.com/images/${coverUuid.replaceAll('-', '/')}/640x640.jpg`;
        } else {
            posterPath = coverUuid || `https://via.placeholder.com/600x600?text=${encodeURIComponent(title)}`;
        }
    }
    // Final foolproof fallback to ensure it's never the string "undefined"
    if (!posterPath || posterPath === "undefined") {
        posterPath = `https://via.placeholder.com/600x600?text=${encodeURIComponent(title)}`;
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
export async function renderMusicView(query = '') {
    const searchResultsContainer = document.getElementById('music-search-results');
    const dynamicSections = document.getElementById('dynamic-music-sections');
    const sectionTitle = document.getElementById('music-section-title');
    
    if (!dynamicSections) return;

    if (query) {
        sectionTitle.textContent = `Search Results for "${query}"`;
        dynamicSections.style.display = 'none';
        document.getElementById('playlists-section').style.display = 'none';
        document.getElementById('recently-played-section').style.display = 'none';
        searchResultsContainer.style.display = 'grid';
        searchResultsContainer.innerHTML = '<div style="color:#aaa; padding: 20px;">Searching Universe...</div>';

        try {
            // Tier 1: Streamex Search (Primary Metadata)
            const results = await searchMusic(query);
            let tracks = results?.data?.items || [];
            
            // Tier 2 Fallback: Saavn Search (Universal Discovery)
            if (tracks.length === 0) {
                console.log("[Search Fallback] No Streamex results, trying Saavn...");
                searchResultsContainer.innerHTML = '<div style="color:#aaa; padding: 20px;">Searching Extended Universe...</div>';
                const saavnResults = await searchMusicSaavn(query);
                // Correctly extract the results array from Saavn's nested data structure
                tracks = saavnResults?.data?.results || saavnResults?.data || [];
            }

            searchResultsContainer.innerHTML = '';
            if (tracks.length === 0) {
                searchResultsContainer.innerHTML = `<div style="color:#888; padding: 40px; text-align:center; width: 100%; grid-column: 1 / -1;">
                    <i class="fa-solid fa-face-frown" style="font-size: 3rem; margin-bottom: 20px; display: block;"></i>
                    No matches found for "${query}". Try another search?
                </div>`;
                return;
            }

            tracks.forEach(t => {
                const parsed = normalizeItem(t, 'music');
                searchResultsContainer.appendChild(createMusicGridCard(parsed, tracks));
            });
        } catch (err) {
            console.error("Search rendering error:", err);
            searchResultsContainer.innerHTML = '<div style="color:#ff4444; padding: 20px;">Search failed to connect to the universe.</div>';
        }
        return;
    }

    // Default discovery View
    sectionTitle.textContent = 'Discovery Universe';
    searchGrid.style.display = 'none';
    dynamicSections.style.display = 'block';
    document.getElementById('playlists-section').style.display = 'block';

    dynamicSections.innerHTML = '';

    // Render Dynamic Categories as Horizontal Rows
    for (const cat of MusicState.categories) {
        const section = document.createElement('section');
        section.className = 'content-row';
        section.style.marginTop = "20px";
        section.innerHTML = `
            <h2 class="section-title" style="margin-bottom: -10px; margin-left: 40px; margin-top: 10px;">${cat.title}</h2>
            <div class="row-posters" id="cat-row-${cat.id}"></div>
        `;
        dynamicSections.appendChild(section);

        const row = section.querySelector('.row-posters');
        enableDragScroll(row); // Native StreamOS horizontal drag
        
        const result = await fetchMusicChart(cat.id, cat.type);
        const tracks = result?.data || result?.tracks?.data || [];
        
        tracks.forEach(item => {
            const parsed = normalizeItem(item, 'music');
            row.appendChild(createMusicGridCard(parsed, tracks));
        });
    }

    renderPlaylistsGrid();
    renderRecentlyPlayedGrid();
}

export function renderPlaylistsGrid() {
    const grid = document.getElementById('music-playlists-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    const playlistNames = Object.keys(MusicState.playlists);
    
    if (playlistNames.length === 0) {
        grid.innerHTML = '<div style="color:var(--text-secondary); grid-column:1/-1;">No playlists yet. Create one to get started!</div>';
        return;
    }

    playlistNames.forEach(name => {
        const pList = MusicState.playlists[name];
        const card = document.createElement('div');
        card.className = 'playlist-card';
        card.tabIndex = 0;
        card.innerHTML = `
            <div class="playlist-icon"><i class="fa-solid fa-music"></i></div>
            <div style="flex:1; display:flex; flex-direction:column; justify-content:center;">
                <div class="playlist-title">${name}</div>
                <div class="playlist-count">${pList.length} Tracks</div>
            </div>
        `;
        card.onclick = () => {
            if(pList.length > 0) playTrack(pList[0], pList);
        };
        card.onkeydown = (e) => { if(e.key === 'Enter') card.click(); };
        card.addEventListener('mouseenter', () => {
            // Optional: Add a visual cue or update a hero banner for the playlist
            // For now, we'll just ensure focus for keyboard navigation consistency
            card.focus();
        });
        grid.appendChild(card);
    });
}

export function renderRecentlyPlayedGrid() {
    const section = document.getElementById('recently-played-section');
    const row = document.getElementById('recent-music-row');
    if (!section || !row) return;

    if (MusicState.recent.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    row.innerHTML = '';
    MusicState.recent.slice(0, 15).forEach(track => {
        row.appendChild(createMusicGridCard(track, MusicState.recent));
    });
}

export function createMusicGridCard(item, queue) {
    const card = document.createElement('div');
    card.className = 'media-card';
    card.dataset.id = item.id;
    if (MusicState.currentTrack && String(MusicState.currentTrack.id) === String(item.id)) {
        card.classList.add('is-active');
    }
    card.tabIndex = 0;
    
    if (item.type === 'artist') card.classList.add('artist-card');
    
    // Using Spotify's Play Button paradigm built directly into the wrapper
    const poster = item.poster || 'https://via.placeholder.com/600x600?text=Music';
    card.innerHTML = `
        <div class="card-img-wrapper">
            <img loading="lazy" src="${poster}" alt="${item.title}" draggable="false">
            <button class="spotify-play-btn" title="Play">
                <i class="fa-solid fa-play"></i>
            </button>
        </div>
        <div class="card-info">
            <h3 class="card-title">${item.title}</h3>
            <div class="card-meta">${item.artist || 'Unknown Artist'}</div>
        </div>
    `;

    const updateHero = () => {
        const heroTitle = document.getElementById('music-hero-title');
        const heroDesc = document.getElementById('music-hero-desc');
        const heroBanner = document.getElementById('music-hero-banner');
        if (heroTitle) heroTitle.textContent = item.title;
        if (heroDesc) heroDesc.textContent = item.artist;
        if (heroBanner && item.poster && heroBanner.style.backgroundImage !== `url("${item.poster}")`) {
            heroBanner.style.backgroundImage = `url('${item.poster}')`;
        }
    };

    card.addEventListener('focus', updateHero);
    card.addEventListener('mouseenter', updateHero);

    card.onclick = () => playTrack(item, queue);
    card.onkeydown = (e) => { if(e.key === 'Enter') card.click(); };
    
    const playBtnStr = card.querySelector('.spotify-play-btn');
    if (playBtnStr) {
        playBtnStr.onclick = (e) => {
            e.stopPropagation();
            playTrack(item, queue);
        };
    }
    
    return card;
}

// Playlist simple global handler
globalThis.openCreatePlaylistModal = function() {
    const modal = document.getElementById('playlist-modal');
    const input = document.getElementById('playlist-name-input');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const createBtn = document.getElementById('modal-create-btn');

    if (!modal || !input) return;

    modal.classList.remove('hidden');
    input.value = '';
    input.focus();

    const closeModal = () => modal.classList.add('hidden');

    cancelBtn.onclick = closeModal;
    createBtn.onclick = () => {
        const name = input.value.trim();
        if (name) {
            if (!MusicState.playlists[name]) {
                MusicState.playlists[name] = [];
                localStorage.setItem('streamos_music_state', JSON.stringify({
                    playlists: MusicState.playlists,
                    recent: MusicState.recent,
                    categories: MusicState.categories
                }));
                // Re-render only necessary parts if possible, or full music view
                const musicView = document.getElementById('view-music');
                if (musicView && !musicView.classList.contains('hidden')) {
                    renderPlaylistsGrid();
                }
            }
            closeModal();
        }
    };

    // Close on escape
    input.onkeydown = (e) => {
        if (e.key === 'Escape') closeModal();
        if (e.key === 'Enter') createBtn.click();
    };
};

export function updateMusicUIActiveState() {
    document.querySelectorAll('.media-card').forEach(card => card.classList.remove('is-active'));
    if (!MusicState.currentTrack) return;
    
    // Find matching cards and highlight them
    document.querySelectorAll('.media-card').forEach(card => {
        if (String(card.dataset.id) === String(MusicState.currentTrack.id)) {
            card.classList.add('is-active');
        }
    });
}

document.addEventListener('streamos:track_changed', () => {
    updateMusicUIActiveState();
    renderRecentlyPlayedGrid();
});

// Bind Playlist Buttons (Multiple)
document.querySelectorAll('.create-playlist-btn').forEach(btn => {
    btn.onclick = () => globalThis.openCreatePlaylistModal();
});

// Search debouncing
let musicSearchTimer;
if (DOM.musicSearchInput) {
    DOM.musicSearchInput.addEventListener('input', (e) => {
        clearTimeout(musicSearchTimer);
        musicSearchTimer = setTimeout(() => {
            renderMusicView(e.target.value.trim());
        }, 600);
    });

    // Support 'Enter' key for immediate search
    DOM.musicSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(musicSearchTimer);
            renderMusicView(DOM.musicSearchInput.value.trim());
        }
    });
}

// Support Button Click for immediate search
if (DOM.musicSearchBtn) {
    DOM.musicSearchBtn.onclick = () => {
        clearTimeout(musicSearchTimer);
        renderMusicView(DOM.musicSearchInput.value.trim());
    };
}
