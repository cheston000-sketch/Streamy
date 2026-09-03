import { IMAGE_URL, BACKDROP_URL } from './api.js?v=116';

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
    nextEpisodeBtn: document.getElementById('next-episode-btn'),
    watchlistBtn: document.getElementById('watchlist-btn'),
    watchedBtn: document.getElementById('watched-btn'),
    detailsRecommendations: document.getElementById('details-recommendations'),
    detailsRecommendationRow: document.getElementById('details-recommendation-row'),
    
    viewLinks: document.getElementById('view-links'),
    linksTitle: document.getElementById('links-title'),
    scraperStatus: document.getElementById('scraper-status'),
    serverList: document.getElementById('server-list'),
    sourceFilterControls: document.getElementById('source-filter-controls'),
    
    // Web Player
    viewPlayer: document.getElementById('view-player'),
    videoPlayer: document.getElementById('video-player'),
    playerBackBtn: document.getElementById('player-back-btn'),
    playerFullscreenBtn: document.getElementById('player-fullscreen-btn'),
    playerServerCycleBtn: document.getElementById('player-server-cycle-btn'),
    playerReloadSourceBtn: document.getElementById('player-reload-source-btn'),
    playerNextSourceBtn: document.getElementById('player-next-source-btn'),
    playerDetailsBtn: document.getElementById('player-details-btn'),
    playerNextEpBtn: document.getElementById('player-next-ep-btn'),
    autoplayOverlay: document.getElementById('autoplay-overlay'),
    autoplayCountdown: document.getElementById('autoplay-countdown-circle'),
    autoplayNextTitle: document.getElementById('autoplay-next-title'),
    autoplaySkipBtn: document.getElementById('autoplay-skip-btn'),
    autoplayCancelBtn: document.getElementById('autoplay-cancel-btn'),
    iframeWrapper: document.querySelector('.player-container'),

    // Profiles System
    profileSelectionScreen: document.getElementById('profile-selection-screen'),
    profilesGrid: document.getElementById('profiles-grid'),
    addProfileBtn: document.getElementById('add-profile-btn'),
    editProfilesBtn: document.getElementById('edit-profiles-btn'),
    profileEditModal: document.getElementById('profile-edit-modal'),
    profileNameInput: document.getElementById('profile-name-input'),
    profileKidCheckbox: document.getElementById('profile-kid-checkbox'),
    saveProfileBtn: document.getElementById('save-profile-btn'),
    deleteProfileBtn: document.getElementById('delete-profile-btn'),
    avatarSelectionGrid: document.getElementById('avatar-selection-grid'),
    modalProfileTitle: document.getElementById('modal-profile-title'),
    cancelProfileBtn: document.getElementById('cancel-profile-btn'),
    currentProfileName: document.getElementById('current-profile-name'),
    currentProfileIcon: document.getElementById('current-profile-icon'),
    switchProfileTab: document.getElementById('switch-profile-tab'),
    mainContent: document.getElementById('main-content'),
    playbackDiagnostics: document.getElementById('playback-diagnostics'),
    refreshPlaybackDiagnosticsBtn: document.getElementById('setting-refresh-playback-diagnostics'),
    copyPlaybackDiagnosticsBtn: document.getElementById('setting-copy-playback-diagnostics'),
    sourcePreferenceSelect: document.getElementById('setting-source-preference'),
    directSourceEndpointInput: document.getElementById('setting-direct-source-endpoint'),
    autoplaySourcesToggle: document.getElementById('setting-autoplay-sources'),
    autoplayNextEpisodeToggle: document.getElementById('setting-autoplay-next-episode'),
    includeBackupSourcesToggle: document.getElementById('setting-include-backup-sources'),
    resetSourceHealthBtn: document.getElementById('setting-reset-source-health')
};

export const cachedBackdrops = {};

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export function normalizeItem(item, typeFallback) {
    let type = item.media_type || item.type || typeFallback;
    let title = item.title || item.name;
    let releaseStr = item.release_date || item.first_air_date || item.year || "";
    let posterPath = item.poster_path ? `${IMAGE_URL}${item.poster_path}` : (item.poster || null);
    let backdropPath = item.backdrop_path ? `${BACKDROP_URL}${item.backdrop_path}` : (item.backdrop || null);
    let descText = item.overview || item.desc || "No comprehensive description natively available.";
    let ratingText = item.vote_average ? `${item.vote_average.toFixed(1)} / 10 Match` : (item.rating || 'New');
    
    return {
        id: item.id || item.tmdbId,
        type: type,
        title: title,
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
    DOM.heroMeta.textContent = `${movie.year} | ${movie.type.toUpperCase()} | ${movie.rating}`;
}

export function enableDragScroll(slider) {
    let isDown = false;
    let startX;
    let scrollLeft;
    let animationFrame;

    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        slider.classList.add('drag-active');
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
        cancelAnimationFrame(animationFrame);
    });

    slider.addEventListener('mouseleave', () => {
        isDown = false;
        slider.classList.remove('drag-active', 'dragging');
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
            } catch(error) {
                 console.warn("[Scroll] Wheel error:", error);
            }
        }
    }, {passive: false});
}

export function buildRow({ title, items, isWatchlistDict = false, typeFallback = 'movie', isFirstRow = false, categoryVal, onCardClick, onViewAllClick }) {
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
        const isContinueWatchingRow = String(title || '').toLowerCase().includes('continue watching');
        if (isWatchlistDict && isContinueWatchingRow && isCompletedHistoryItem(parsed)) return;

        const card = document.createElement('div');
        card.className = 'poster-card';
        card.tabIndex = 0;
        
        const progress = getPlaybackProgressInfo(parsed);
        let progressHtml = '';
        if (progress.hasProgress) {
            progressHtml = `
                <div class="poster-progress-track">
                    <div class="poster-progress-fill" style="width:${progress.percent}%;"></div>
                </div>
                <div class="poster-progress-label">${progress.label}</div>
            `;
        }
        const watchedHtml = isCompletedHistoryItem(parsed)
            ? '<div class="poster-watched-badge"><i class="fa-solid fa-check"></i> Watched</div>'
            : '';
        const ratingValue = parsed.vote_average ? Number(parsed.vote_average).toFixed(1) : '';
        const metaText = [parsed.year, ratingValue ? `${ratingValue}/10` : parsed.rating].filter(Boolean).join(' | ');
        card.innerHTML = `
            <img loading="lazy" src="${parsed.poster}" alt="${escapeHtml(parsed.title)}" draggable="false">
            <div class="poster-card-shine"></div>
            <div class="poster-info">
                <span class="poster-title">${escapeHtml(parsed.title)}</span>
                <span class="poster-subline">${escapeHtml(metaText)}</span>
            </div>
            ${watchedHtml}${progressHtml}
        `;
        
        card.addEventListener('focus', () => {
             updateHeroBanner(parsed);
        });
        
        // Mouse hover acts like D-Pad focus
        card.addEventListener('mouseenter', () => {
             card.focus();
        });
        
        card.onclick = () => onCardClick(parsed);
        card.onkeydown = (e) => { if(e.key === 'Enter') card.click(); };
        
        if (isFirstRow && index === 0) {
            setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) card.focus(); }, 500);
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

export function renderGridItems(items, container, typeFallback, onCardClick, options = {}) {
    const append = options.append === true;
    if (!append) container.innerHTML = '';

    const existingKeys = new Set(
        Array.from(container.querySelectorAll('.poster-card[data-media-key]'))
            .map(card => card.dataset.mediaKey)
    );
    const fragment = document.createDocumentFragment();
    const renderedCards = [];

    (Array.isArray(items) ? items : []).forEach(item => {
        const parsed = normalizeItem(item, typeFallback);
        if (!parsed.poster || parsed.poster === 'null') return;

        const mediaKey = parsed.id == null ? '' : `${parsed.type}:${parsed.id}`;
        if (mediaKey && existingKeys.has(mediaKey)) return;
        if (mediaKey) existingKeys.add(mediaKey);

        const card = document.createElement('div');
        card.className = 'poster-card';
        card.tabIndex = 0;
        if (mediaKey) card.dataset.mediaKey = mediaKey;
        
        const watchedHtml = isCompletedHistoryItem(parsed)
            ? '<div class="poster-watched-badge"><i class="fa-solid fa-check"></i> Watched</div>'
            : '';
        const ratingValue = parsed.vote_average ? Number(parsed.vote_average).toFixed(1) : '';
        const metaText = [parsed.year, ratingValue ? `${ratingValue}/10` : parsed.rating].filter(Boolean).join(' | ');
        card.innerHTML = `
            <img loading="lazy" src="${parsed.poster}" alt="${escapeHtml(parsed.title)}" draggable="false">
            <div class="poster-card-shine"></div>
            <div class="poster-info">
                <span class="poster-title">${escapeHtml(parsed.title)}</span>
                <span class="poster-subline">${escapeHtml(metaText)}</span>
            </div>
            ${watchedHtml}
        `;
        
        card.onclick = () => onCardClick(parsed);
        card.onkeydown = (e) => { if(e.key === 'Enter') card.click(); };
        card.addEventListener('mouseenter', () => card.focus());
        fragment.appendChild(card);
        renderedCards.push(card);
    });

    container.appendChild(fragment);
    return renderedCards;
}

// Watchlist Helpers
function getWatchlistKey() {
    const activeProfileRaw = globalThis.localStorage.getItem('streamy_active_profile');
    return activeProfileRaw ? `streamy_watchlist_${activeProfileRaw}` : 'streamy_watchlist_default';
}

function getActiveProfileId() {
    return globalThis.localStorage.getItem('streamy_active_profile') || 'default';
}

function getPlaybackStoreKey() {
    return `streamy_playback_progress_${getActiveProfileId()}`;
}

function getCompletedStoreKey() {
    return `streamy_completed_${getActiveProfileId()}`;
}

function readJsonObject(key) {
    try {
        const parsed = JSON.parse(globalThis.localStorage.getItem(key) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

function getPlaybackMediaKeyForItem(item) {
    if (!item?.id) return '';
    const profileId = getActiveProfileId();
    if ((item.type || 'movie') === 'tv') {
        const progress = getSeriesProgress(item.id);
        const seasonNumber = progress.last_season || 1;
        const episodeNumber = progress.last_episode || 1;
        return `${profileId}:tv:${item.id}:s${seasonNumber}:e${episodeNumber}`;
    }
    return `${profileId}:${item.type || 'movie'}:${item.id}`;
}

function getCompletedKeyForItem(item) {
    if (!item?.id) return '';
    const type = item.type || 'movie';
    if (type === 'tv') {
        const progress = getSeriesProgress(item.id);
        return `tv:${item.id}:s${progress.last_season || 1}:e${progress.last_episode || 1}`;
    }
    return `${type}:${item.id}`;
}

function normalizeProgressRecord(raw) {
    if (typeof raw === 'number') {
        return { positionMs: raw, durationMs: 0, updatedAt: 0 };
    }
    if (raw && typeof raw === 'object') {
        return {
            positionMs: Number(raw.positionMs || raw.position || 0),
            durationMs: Number(raw.durationMs || raw.duration || 0),
            updatedAt: Number(raw.updatedAt || 0)
        };
    }
    return { positionMs: 0, durationMs: 0, updatedAt: 0 };
}

export function getPlaybackProgressInfo(item) {
    const mediaKey = getPlaybackMediaKeyForItem(item);
    if (!mediaKey) return { hasProgress: false, percent: 0, label: '' };

    const db = readJsonObject(getPlaybackStoreKey());
    let record = normalizeProgressRecord(db[mediaKey]);

    if (globalThis.NativeBridge && typeof globalThis.NativeBridge.getPlaybackProgress === 'function') {
        const nativePosition = Number(globalThis.NativeBridge.getPlaybackProgress(mediaKey));
        if (Number.isFinite(nativePosition) && nativePosition > record.positionMs) {
            record = { ...record, positionMs: nativePosition };
        }
    }

    if (!Number.isFinite(record.positionMs) || record.positionMs < 30000) {
        return { hasProgress: false, percent: 0, label: '' };
    }

    const percent = record.durationMs > 0
        ? Math.max(5, Math.min(96, Math.round((record.positionMs / record.durationMs) * 100)))
        : 18;
    const minutes = Math.max(1, Math.floor(record.positionMs / 60000));
    return {
        hasProgress: true,
        percent,
        label: `Resume ${minutes}m`
    };
}

export function markPlaybackCompleted(item) {
    const completedKey = getCompletedKeyForItem(item);
    if (!completedKey) return;

    const db = readJsonObject(getCompletedStoreKey());
    db[completedKey] = Date.now();
    globalThis.localStorage.setItem(getCompletedStoreKey(), JSON.stringify(db));
}

export function clearPlaybackCompleted(item) {
    const completedKey = getCompletedKeyForItem(item);
    if (!completedKey) return;

    const db = readJsonObject(getCompletedStoreKey());
    delete db[completedKey];
    globalThis.localStorage.setItem(getCompletedStoreKey(), JSON.stringify(db));
}

export function isCompletedHistoryItem(item) {
    const completedKey = getCompletedKeyForItem(item);
    if (!completedKey) return false;

    const db = readJsonObject(getCompletedStoreKey());
    return !!db[completedKey];
}

export function getWatchlistItems() {
    try {
        const parsed = JSON.parse(globalThis.localStorage.getItem(getWatchlistKey()) || '[]');
        return Array.isArray(parsed) ? parsed.filter(item => item && item.id) : [];
    } catch (error) {
        return [];
    }
}

export function isInWatchlist(id) {
    return getWatchlistItems().some(x => String(x.id) === String(id));
}

export function toggleWatchlist(item, btnElement) {
    if (!item?.id) return;
    const watchKey = getWatchlistKey();
    let list = getWatchlistItems();

    const normalizedItem = normalizeItem(item, item.type || item.media_type || 'movie');
    const index = list.findIndex(x => String(x.id) === String(normalizedItem.id));
    let added = false;
    if (index > -1) {
        list.splice(index, 1);
        if(btnElement) {
            btnElement.innerHTML = '<i class="fa-solid fa-plus"></i> WATCHLIST';
            btnElement.classList.remove('active');
            btnElement.setAttribute('aria-pressed', 'false');
        }
    } else {
        list.unshift(normalizedItem);
        added = true;
        if(btnElement) {
            btnElement.innerHTML = '<i class="fa-solid fa-check"></i> ON WATCHLIST';
            btnElement.classList.add('active');
            btnElement.setAttribute('aria-pressed', 'true');
        }
    }
    globalThis.localStorage.setItem(watchKey, JSON.stringify(list));
    globalThis.dispatchEvent(new Event('watchlist-updated'));
    return added;
}

export function getSeriesProgress(tmdbId) {
    const activeProfileRaw = globalThis.localStorage.getItem('streamy_active_profile');
    const key = `streamy_series_progress_${activeProfileRaw || 'default'}`;
    const db = JSON.parse(localStorage.getItem(key) || '{}');
    return db[tmdbId] || { last_season: 1, last_episode: 1, watched: [] };
}

export function saveSeriesProgress(tmdbId, s, e) {
    const activeProfileRaw = globalThis.localStorage.getItem('streamy_active_profile');
    const key = `streamy_series_progress_${activeProfileRaw || 'default'}`;
    const db = JSON.parse(localStorage.getItem(key) || '{}');
    if (!db[tmdbId]) db[tmdbId] = { watched: [] };
    db[tmdbId].last_season = Number.parseInt(s, 10);
    db[tmdbId].last_episode = Number.parseInt(e, 10);
    const epKey = `s${s}e${e}`;
    if (!db[tmdbId].watched.includes(epKey)) db[tmdbId].watched.push(epKey);
    localStorage.setItem(key, JSON.stringify(db));
}
