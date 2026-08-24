import { DOM, buildRow, renderGridItems, enableDragScroll, getWatchlistItems, isCompletedHistoryItem } from './ui.js?v=112';
import { CACHE_DB_NAME, buildBackendFetchOptions, discoverByCategory, discoverBackendHost, fetchFromTMDB, getProxyHost, getManualBackendHost, rememberDiscoveredBackendHost, setManualBackendHost, getDiscoveryLogs } from './api.js?v=112';
import { openDetails, getPlaybackDiagnosticsText, copyPlaybackDiagnostics, getPlaybackSettings, savePlaybackSettings, resetSourceHealth } from './player.js?v=112';
import { setupRouter, navigateTo } from './router.js?v=112';
import { NavigationManager } from './navigation.js?v=112';

let activeProfile = null;
let currentFullCategory = null; // { type: 'movie', val: '28', page: 1, title: 'Action' }
let activeCategoryController = null;
let activeCategoryRequestId = 0;
let categoryLoadMoreInFlight = false;
let activeRowsRenderToken = 0;
let focusedRowsRenderToken = -1;

// Navigation Manager is now imported

const APP_VERSION = 112;
const UPDATE_SERVER = 'https://streamy-vez5.onrender.com';

async function checkForUpdatesBackground() {
    try {
        const HOST = getProxyHost();
        console.log(`[Discovery] Validating backend via ${HOST}...`);
        
        const res = await fetch(`${HOST}/api/ota`, buildBackendFetchOptions(HOST, { 
            method: 'GET', 
            cache: 'no-cache'
        }));
        if (!res.ok) throw new Error("OTA Fetch Fail");
        
        const data = await res.json();

        // Dynamic Backend Discovery (Force Sync)
        if (data.backend_url) {
            const oldHost = globalThis.localStorage.getItem('streamy_backend_host');
            if (oldHost !== data.backend_url) {
                rememberDiscoveredBackendHost(data.backend_url);
                console.log("[Discovery] backend_url updated:", data.backend_url);
            }
        }

        if (data.version && APP_VERSION < data.version) {
            showUpdateBanner(data.version, data.url);
        }
    } catch(e) { 
        console.warn("[Discovery] Background sync failed:", e.message);
    }
}

function showUpdateBanner(newVersionKey, downloadUrl) {
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed; top:20px; right:20px; background:#ff8a1f; color:#071017; padding:15px; border-radius:14px; z-index:999999; display:flex; align-items:center; gap:15px; box-shadow:0 4px 15px rgba(0,0,0,0.5); font-weight:bold; cursor:pointer; font-size:18px; border:2px solid white;';
    banner.tabIndex = 0;
    const HOST = globalThis.location.hostname === 'localhost' ? 'http://localhost:3000' : `https://${globalThis.location.hostname}`;
    banner.innerHTML = `<i class="fa-solid fa-download" style="font-size:24px;"></i> <div>Streamy Update Available!<br><span style="font-size:12px;font-weight:normal;">Click to install v${newVersionKey}.0</span></div>`;
    banner.onclick = () => {
        localStorage.setItem('streamy_build_version', newVersionKey);
        if(globalThis.NativeBridge?.downloadUpdate) {
            globalThis.NativeBridge.downloadUpdate(downloadUrl || `${HOST}/api/ota/download`);
        } else {
            globalThis.open(downloadUrl || `${HOST}/api/ota/download`, '_blank');
        }
        banner.remove();
    };
    banner.onkeydown = (e) => { if(e.key === 'Enter') banner.click(); };
    document.body.appendChild(banner);
}

const TV_NETWORKS = {
    '213': 'Netflix',
    '453': 'Hulu',
    '2552': 'Apple+',
    '1024': 'Amazon Prime',
    '4330': 'Paramount+',
    '3186': 'HBO Max',
    '2739': 'Disney+'
};

const MOVIE_GENRES = {
    '28': 'Action',
    '27': 'Horror',
    '35': 'Comedy',
    '18': 'Drama',
    '878': 'Sci-Fi',
    '10751': 'Family'
};

const MOVIE_HOME_ROWS = [
    { title: 'Trending', categoryVal: 'trending' },
    { title: 'Now Playing', categoryVal: 'now_playing' },
    { title: 'Action', categoryVal: '28' },
    { title: 'Horror', categoryVal: '27' },
    { title: 'Comedy', categoryVal: '35' },
    { title: 'Drama', categoryVal: '18' },
    { title: 'Sci-Fi', categoryVal: '878' },
    { title: 'Family', categoryVal: '10751' },
    { title: 'Netflix', categoryVal: 'watch_region=US&with_watch_providers=8' },
    { title: 'Hulu', categoryVal: 'watch_region=US&with_watch_providers=15' },
    { title: 'Apple+', categoryVal: 'watch_region=US&with_watch_providers=350' },
    { title: 'Amazon Prime', categoryVal: 'watch_region=US&with_watch_providers=9' },
    { title: 'Paramount+', categoryVal: 'watch_region=US&with_watch_providers=531' },
    { title: 'HBO Max', categoryVal: 'watch_region=US&with_watch_providers=1899' },
    { title: 'Disney+', categoryVal: 'watch_region=US&with_watch_providers=337' },
    { title: 'Angel Studios', categoryVal: 'company:165435' }
];

const TV_HOME_ROWS = [
    { title: 'Trending', categoryVal: 'trending' },
    { title: 'Now Playing', categoryVal: 'on_the_air' },
    { title: 'Action', categoryVal: '10759' },
    { title: 'Horror', categoryVal: '9648' },
    { title: 'Comedy', categoryVal: '35' },
    { title: 'Drama', categoryVal: '18' },
    { title: 'Sci-Fi', categoryVal: '10765' },
    { title: 'Family', categoryVal: '10751' },
    { title: 'Netflix', categoryVal: 'watch_region=US&with_watch_providers=8' },
    { title: 'Hulu', categoryVal: 'watch_region=US&with_watch_providers=15' },
    { title: 'Apple+', categoryVal: 'watch_region=US&with_watch_providers=350' },
    { title: 'Amazon Prime', categoryVal: 'watch_region=US&with_watch_providers=9' },
    { title: 'Paramount+', categoryVal: 'watch_region=US&with_watch_providers=531' },
    { title: 'HBO Max', categoryVal: 'watch_region=US&with_watch_providers=1899' },
    { title: 'Disney+', categoryVal: 'watch_region=US&with_watch_providers=337' },
    { title: 'Angel Studios', categoryVal: 'company:165435' }
];

const KIDS_MOVIE_ROWS = [
    { title: 'Trending', categoryVal: 'trending' },
    { title: 'Popular', categoryVal: 'popular' },
    { title: 'Angel Studios', categoryVal: 'company:165435' },
    { title: 'Family', categoryVal: '10751' },
    { title: 'Animation', categoryVal: '16' },
    { title: 'Comedy', categoryVal: '35' },
    { title: 'Adventure', categoryVal: '12' },
    { title: 'Fantasy', categoryVal: '14' }
];

const KIDS_TV_ROWS = [
    { title: 'Trending', categoryVal: 'trending' },
    { title: 'Popular', categoryVal: 'popular' },
    { title: 'Airing Today', categoryVal: 'airing_today' },
    { title: 'Angel Studios', categoryVal: 'company:165435' },
    { title: 'Netflix Kids', categoryVal: 'network:213' },
    { title: 'Disney+', categoryVal: 'network:2739' },
    { title: 'PBS Kids', categoryVal: 'company:73756' },
    { title: 'Nickelodeon', categoryVal: 'network:13' },
    { title: 'Cartoon Network', categoryVal: 'network:56' }
];

function getMovieRowsForProfile() {
    return activeProfile?.isKid ? KIDS_MOVIE_ROWS : MOVIE_HOME_ROWS;
}

function getTvRowsForProfile() {
    return activeProfile?.isKid ? KIDS_TV_ROWS : TV_HOME_ROWS;
}

function updateFilterDropdown(type) {
    const filter = DOM.genreFilter;
    if(type === 'movies') {
        const rows = getMovieRowsForProfile();
        filter.dataset.mediaType = 'movie';
        filter.innerHTML = `<option value="" style="background:#141414;">${activeProfile?.isKid ? 'All Kids Movies' : 'All Movies'}</option>`;
        rows.forEach(row => {
            filter.innerHTML += `<option value="${row.categoryVal}" style="background:#141414;">${row.title}</option>`;
        });
        filter.classList.remove('hidden');
    } else if (type === 'tv') {
        const rows = getTvRowsForProfile();
        filter.dataset.mediaType = 'tv';
        filter.innerHTML = `<option value="" style="background:#141414;">${activeProfile?.isKid ? 'All Kids Shows' : 'All TV Shows'}</option>`;
        rows.forEach(row => {
            filter.innerHTML += `<option value="${row.categoryVal}" style="background:#141414;">${row.title}</option>`;
        });
        filter.classList.remove('hidden');
    } else {
        delete filter.dataset.mediaType;
        filter.classList.add('hidden');
    }
}

function isRowsRoute() {
    const hash = globalThis.location.hash || '#home';
    return hash === '#home' || hash === '#movies' || hash === '#tv' || hash === '#watchlist';
}

function isHiddenByClass(el) {
    return !!el?.closest?.('.hidden');
}

function shouldMoveFocusIntoRows() {
    const active = document.activeElement;
    if (!active || active === document.body || isHiddenByClass(active)) return true;
    if (DOM.rowsContainer?.contains(active)) return false;
    return !!active.closest?.('#top-bar, .nav-tabs');
}

function focusFirstRowCard(renderToken = activeRowsRenderToken) {
    setTimeout(() => {
        if (renderToken !== activeRowsRenderToken) return;
        if (focusedRowsRenderToken === renderToken) return;
        if (!isRowsRoute() || !shouldMoveFocusIntoRows()) return;

        const firstCard = DOM.rowsContainer?.querySelector('.poster-card');
        if (firstCard) {
            focusedRowsRenderToken = renderToken;
            firstCard.focus();
            forceInitialFireTvPaint();
        }
    }, 80);
}

// Profiles System
function getProfiles() {
    try {
        const raw = globalThis.localStorage.getItem('streamy_profiles');
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed.filter(p => p && typeof p === 'object' && p.id) : [];
    } catch(e) { return []; }
}
function saveProfiles(profiles) {
    globalThis.localStorage.setItem('streamy_profiles', JSON.stringify(profiles));
}

function setProfilesEditing(isEditing) {
    DOM.profilesGrid.classList.toggle('edit-mode', isEditing);
    DOM.editProfilesBtn.innerHTML = isEditing
        ? '<i class="fa-solid fa-check"></i> Done Editing'
        : '<i class="fa-solid fa-pen"></i> Manage Profiles';
    renderProfilesScreen(getProfiles(), -1, isEditing);
}

function showProfilesScreen({ editing = false, focusFirst = true } = {}) {
    DOM.profileSelectionScreen.classList.remove('hidden');
    DOM.mainContent.classList.add('hidden');
    DOM.topBar.classList.add('hidden');
    setProfilesEditing(editing);
    if (focusFirst) {
        setTimeout(() => DOM.profilesGrid.firstChild?.focus(), 160);
    }
}

function initProfiles() {
    let profiles = getProfiles();
    
    // Ensure mandatory profiles exist
    const mandatory = [
        { id: 'profile_adult', name: 'Default', avatar: '1', primary: true, isKid: false },
        { id: 'profile_kids', name: 'Kids', avatar: '2', primary: false, isKid: true }
    ];

    let profilesUpdated = false;
    mandatory.forEach(m => {
        if (!profiles.some(p => p && p.id === m.id)) {
            profiles.push(m);
            profilesUpdated = true;
        }
    });

    if (profilesUpdated) saveProfiles(profiles);
    
    const activeId = globalThis.localStorage.getItem('streamy_active_profile');
    if (activeId) {
        activeProfile = profiles.find(p => p && p.id === activeId);
    }

    const activeIndex = activeProfile
        ? profiles.findIndex(p => p && p.id === activeProfile.id)
        : 0;
    
    // Always render for the switcher even if we don't show the screen yet
    renderProfilesScreen(profiles, activeIndex);

    // If we have an active profile, stay in the main app
    if (activeProfile) {
        selectProfile(activeProfile, true); // true = silent init
        return true; 
    } 
    
    // Otherwise, show the selection screen
    showProfilesScreen({ editing: false, focusFirst: true });
    return false;
}
    
function initProfileBindings() {
    DOM.editProfilesBtn.onclick = () => setProfilesEditing(!DOM.profilesGrid.classList.contains('edit-mode'));

    DOM.addProfileBtn.onclick = () => openProfileModal(null);
    DOM.settingManageProfiles.onclick = () => showProfilesScreen({ editing: true, focusFirst: true });

    DOM.cancelProfileBtn.onclick = () => {
        DOM.profileEditModal.classList.add('hidden');
        NavigationManager.lockFocus('#profile-selection-screen');
        setTimeout(() => DOM.addProfileBtn?.focus(), 120);
    };
    const versionEl = document.getElementById('setting-build-version');
    if (versionEl) versionEl.innerText = `${APP_VERSION}.0 (GLOBAL SYNC SUCCESS)`;
    
    checkForUpdatesBackground();
}

function renderProfilesScreen(profiles, focusIndex = 0, isEditing = false) {
    DOM.profilesGrid.innerHTML = '';
    
    profiles.forEach((p, idx) => {
        const card = document.createElement('button');
        card.className = `profile-card ${isEditing ? 'edit-mode' : ''}`;
        card.tabIndex = 0;
        card.style.background = 'transparent'; card.style.border = 'none'; card.style.color = 'white';
        
        const svgContent = `<i class="fa-solid fa-user"></i>`;
        
        card.innerHTML = `
            <div class="profile-avatar">${svgContent}${p.isKid ? '<span class="kid-badge">KIDS</span>' : ''}</div>
            <div style="font-size: 1.5rem; font-weight: bold; text-shadow: 1px 1px 3px black;">${p.name}</div>
        `;
        
        card.onclick = () => {
            if (isEditing) openProfileModal(p);
            else selectProfile(p);
        };
        card.onkeydown = (e) => { if(e.key === 'Enter') card.click(); };
        DOM.profilesGrid.appendChild(card);
        
        if (focusIndex === idx) setTimeout(() => card.focus(), 150);
    });

    NavigationManager.lockFocus('#profile-selection-screen');
}

function openProfileModal(profile) {
    DOM.profileEditModal.dataset.editingId = profile ? profile.id : '';
    DOM.modalProfileTitle.textContent = profile ? 'Edit Profile' : 'Add Profile';
    DOM.profileNameInput.value = profile ? profile.name : '';
    DOM.profileKidCheckbox.checked = profile ? !!profile.isKid : false;
    
    // Lock the "Is Kid" checkbox ONLY for mandatory profiles
    const mandatoryIds = new Set(['profile_adult', 'profile_kids']);
    DOM.profileKidCheckbox.disabled = profile && mandatoryIds.has(profile.id);
    
    // Manage Delete button: Hide for mandatory profiles
    if (profile && !mandatoryIds.has(profile.id)) DOM.deleteProfileBtn.classList.remove('hidden');
    else DOM.deleteProfileBtn.classList.add('hidden');
    
    // Ensure "Manage Profiles" from settings is visible
    DOM.settingManageProfiles.style.display = 'flex';
    
    // Simulate Avatar Selection Grid
    DOM.avatarSelectionGrid.innerHTML = `
        <button class="nav-tab active" style="font-size:3rem; padding:10px;"><i class="fa-solid fa-user"></i></button>
        <button class="nav-tab" style="font-size:3rem; padding:10px;"><i class="fa-solid fa-ghost"></i></button>
        <button class="nav-tab" style="font-size:3rem; padding:10px;"><i class="fa-solid fa-robot"></i></button>
    `;

    DOM.saveProfileBtn.onclick = () => {
        if (!DOM.profileNameInput.value.trim()) return;
        let profiles = getProfiles();
        if (profile) {
            const index = profiles.findIndex(x => x && x.id === profile.id);
            if (index > -1) {
                profiles[index].name = DOM.profileNameInput.value.trim();
                profiles[index].isKid = DOM.profileKidCheckbox.checked;
            }
        } else {
            profiles.push({ id: Date.now().toString(), name: DOM.profileNameInput.value.trim(), avatar: '1', isKid: DOM.profileKidCheckbox.checked });
        }
        saveProfiles(profiles);
        DOM.profileEditModal.classList.add('hidden');
        renderProfilesScreen(profiles, -1, true);
        NavigationManager.lockFocus('#profile-selection-screen');
        setTimeout(() => DOM.profilesGrid.lastElementChild?.focus(), 120);
    };

    DOM.deleteProfileBtn.onclick = () => {
        let profiles = getProfiles();
        profiles = profiles.filter(x => x && x.id !== profile.id);
        if (activeProfile && activeProfile.id === profile.id) {
            activeProfile = profiles[0] || null;
            if (activeProfile) {
                globalThis.localStorage.setItem('streamy_active_profile', activeProfile.id);
                DOM.currentProfileName.textContent = activeProfile.name;
            } else {
                globalThis.localStorage.removeItem('streamy_active_profile');
                DOM.currentProfileName.textContent = 'User';
            }
        }
        saveProfiles(profiles);
        DOM.profileEditModal.classList.add('hidden');
        renderProfilesScreen(profiles, -1, true);
        NavigationManager.lockFocus('#profile-selection-screen');
        setTimeout(() => DOM.profilesGrid.firstElementChild?.focus(), 120);
    };

    DOM.profileEditModal.classList.remove('hidden');
    DOM.profileNameInput.focus();
    DOM.profileNameInput.onkeydown = event => {
        if (event.key === 'Enter') {
            DOM.saveProfileBtn.click();
        }
    };
    NavigationManager.lockFocus('#profile-edit-modal');
}

// Removed redundant fetchTMDB function

function selectProfile(profile, silent = false) {
    activeProfile = profile;
    globalThis.localStorage.setItem('streamy_active_profile', profile.id);
    DOM.currentProfileName.textContent = profile.name;
    
    DOM.profileSelectionScreen.classList.add('hidden');
    DOM.mainContent.classList.remove('hidden');
    DOM.topBar.classList.remove('hidden');
    
    DOM.genreFilter.classList.remove('hidden');
    DOM.genreFilter.value = '';
    
    if (!silent) {
        navigateTo('#home');
    }
}

async function getBecauseYouWatchedItems(type) {
    const histKey = 'streamy_history_' + (activeProfile ? activeProfile.id : 'default');
    let history = [];
    try {
        history = JSON.parse(globalThis.localStorage.getItem(histKey) || '[]');
        if (!Array.isArray(history)) history = [];
    } catch (error) {
        history = [];
    }

    const seeds = history
        .filter(item => item && item.id && (item.type || 'movie') === type)
        .slice(0, 3);

    if (!seeds.length) return [];

    const recommendationSets = await Promise.all(
        seeds.map(item => fetchFromTMDB(`/${type}/${item.id}/recommendations?page=1`))
    );

    const seen = new Set(seeds.map(item => String(item.id)));
    const deduped = [];
    recommendationSets.flat().forEach(item => {
        const itemId = String(item?.id || '');
        if (!itemId || seen.has(itemId)) return;
        seen.add(itemId);
        deduped.push(item);
    });

    return deduped.slice(0, 20);
}

// Data Fetching and Rows Array
async function loadMovieRows() {
    const renderToken = ++activeRowsRenderToken;
    DOM.rowsContainer.innerHTML = '';
    // Fetch History first
    const histKey = 'streamy_history_' + (activeProfile ? activeProfile.id : 'default');
    let hList = JSON.parse(globalThis.localStorage.getItem(histKey) || '[]');
    const movieHistory = hList.filter(item => (item?.type || 'movie') === 'movie' && !isCompletedHistoryItem(item));
    if(movieHistory.length > 0) {
        buildRow({ title: 'Continue Watching', items: movieHistory, isWatchlistDict: true, typeFallback: 'movie', isFirstRow: true, onCardClick: openDetails });
        focusFirstRowCard(renderToken);
    }
    if (movieHistory.length > 0) {
        const becauseYouWatched = await getBecauseYouWatchedItems('movie');
        if (renderToken !== activeRowsRenderToken) return;
        if (becauseYouWatched.length > 0) {
            buildRow({
                title: 'Because You Watched',
                items: becauseYouWatched,
                typeFallback: 'movie',
                isFirstRow: movieHistory.length === 0,
                onCardClick: openDetails
            });
            focusFirstRowCard(renderToken);
        }
    }

    const movieRows = getMovieRowsForProfile();
    for (let index = 0; index < movieRows.length; index++) {
        const row = movieRows[index];
        const items = await discoverByCategory('movie', row.categoryVal, 1);
        if (renderToken !== activeRowsRenderToken) return;
        buildRow({
            title: row.title,
            items,
            typeFallback: 'movie',
            isFirstRow: movieHistory.length === 0 && index === 0,
            categoryVal: row.categoryVal,
            onCardClick: openDetails,
            onViewAllClick: openCategoryView
        });
        focusFirstRowCard(renderToken);
    }
}

async function loadTVRows() {
    const renderToken = ++activeRowsRenderToken;
    DOM.rowsContainer.innerHTML = '';
    const histKey = 'streamy_history_' + (activeProfile ? activeProfile.id : 'default');
    let hList = JSON.parse(globalThis.localStorage.getItem(histKey) || '[]');
    const tvHistory = hList.filter(item => (item?.type || 'movie') === 'tv' && !isCompletedHistoryItem(item));
    if(tvHistory.length > 0) {
        buildRow({ title: 'Continue Watching', items: tvHistory, isWatchlistDict: true, typeFallback: 'tv', isFirstRow: true, onCardClick: openDetails });
        focusFirstRowCard(renderToken);
    }
    const becauseYouWatched = await getBecauseYouWatchedItems('tv');
    if (renderToken !== activeRowsRenderToken) return;
    if (becauseYouWatched.length > 0) {
        buildRow({
            title: 'Because You Watched',
            items: becauseYouWatched,
            typeFallback: 'tv',
            isFirstRow: tvHistory.length === 0,
            onCardClick: openDetails
        });
        focusFirstRowCard(renderToken);
    }
    const tvRows = getTvRowsForProfile();
    for (let index = 0; index < tvRows.length; index++) {
        const row = tvRows[index];
        const items = await discoverByCategory('tv', row.categoryVal, 1);
        if (renderToken !== activeRowsRenderToken) return;
        buildRow({
            title: row.title,
            items,
            typeFallback: 'tv',
            isFirstRow: tvHistory.length === 0 && becauseYouWatched.length === 0 && index === 0,
            categoryVal: row.categoryVal,
            onCardClick: openDetails,
            onViewAllClick: openCategoryView
        });
        focusFirstRowCard(renderToken);
    }
}

function loadWatchlist() {
    const renderToken = ++activeRowsRenderToken;
    DOM.rowsContainer.innerHTML = '';
    const list = getWatchlistItems();
    if(list.length > 0) {
        buildRow({ title: 'My Watchlist', items: list, isWatchlistDict: true, typeFallback: 'movie', isFirstRow: true, categoryVal: 'watchlist', onCardClick: openDetails });
        focusFirstRowCard(renderToken);
    } else {
        DOM.rowsContainer.innerHTML = '<h2 style="padding: 100px; text-align:center; color:#555;">No Titles in Watchlist</h2>';
    }
}

function setCategoryLoadMoreState(state) {
    const button = DOM.categoryLoadMore;
    button.dataset.state = state;
    button.hidden = state === 'hidden';
    button.disabled = state === 'hidden';
    button.setAttribute('aria-disabled', String(state === 'loading' || state === 'end'));

    const labels = {
        idle: 'Load More Titles',
        loading: 'Loading More Titles...',
        retry: 'Retry Loading Titles',
        end: 'All Titles Loaded',
        hidden: 'Load More Titles'
    };
    button.textContent = labels[state] || labels.idle;
}

function renderCategoryState(message, isError = false) {
    DOM.categoryGrid.innerHTML = '';
    const state = document.createElement('div');
    state.className = `grid-state${isError ? ' grid-state-error' : ''}`;
    state.textContent = message;
    DOM.categoryGrid.appendChild(state);
}

function isActiveCategoryRequest(requestId, category) {
    return requestId === activeCategoryRequestId
        && category === currentFullCategory
        && globalThis.location.hash.startsWith('#category');
}

function focusFirstCategoryCard(cards) {
    if (!cards.length) return;
    requestAnimationFrame(() => {
        const active = document.activeElement;
        const focusIsUnclaimed = !active
            || active === document.body
            || active === DOM.categoryLoadMore
            || active.closest?.('.hidden');
        if (focusIsUnclaimed) cards[0].focus();
    });
}

async function openCategoryView(title, val, typeFallback) {
    activeCategoryController?.abort();
    const controller = new AbortController();
    const requestId = ++activeCategoryRequestId;
    const category = { type: typeFallback, val, page: 1, title, hasMore: true };
    activeCategoryController = controller;
    categoryLoadMoreInFlight = false;
    currentFullCategory = category;

    DOM.viewCategoryTitle.textContent = title;
    DOM.categoryGrid.setAttribute('aria-busy', 'true');
    renderCategoryState('Loading titles...');
    setCategoryLoadMoreState('hidden');
    navigateTo('#category');

    try {
        const results = await discoverByCategory(typeFallback, val, 1, { signal: controller.signal });
        if (!isActiveCategoryRequest(requestId, category)) return;

        const cards = renderGridItems(results, DOM.categoryGrid, typeFallback, openDetails);
        category.hasMore = results.length >= 20;
        if (!cards.length) {
            renderCategoryState('No titles are available in this category.');
            setCategoryLoadMoreState('hidden');
            return;
        }

        setCategoryLoadMoreState(category.hasMore ? 'idle' : 'hidden');
        focusFirstCategoryCard(cards);
    } catch (error) {
        if (error?.name === 'AbortError' || !isActiveCategoryRequest(requestId, category)) return;
        console.error('[Category] Unable to load titles:', error);
        renderCategoryState('Unable to load this category. Please go back and try again.', true);
        setCategoryLoadMoreState('hidden');
    } finally {
        if (requestId === activeCategoryRequestId) {
            DOM.categoryGrid.setAttribute('aria-busy', 'false');
            if (activeCategoryController === controller) activeCategoryController = null;
        }
    }
}

DOM.categoryLoadMore.onclick = async () => {
    const category = currentFullCategory;
    if (!category || categoryLoadMoreInFlight || category.hasMore === false) return;
    if (!globalThis.location.hash.startsWith('#category')) return;

    activeCategoryController?.abort();
    const controller = new AbortController();
    const requestId = ++activeCategoryRequestId;
    const nextPage = category.page + 1;
    activeCategoryController = controller;
    categoryLoadMoreInFlight = true;
    DOM.categoryGrid.setAttribute('aria-busy', 'true');
    setCategoryLoadMoreState('loading');

    try {
        const results = await discoverByCategory(category.type, category.val, nextPage, { signal: controller.signal });
        if (!isActiveCategoryRequest(requestId, category)) return;

        const cards = renderGridItems(results, DOM.categoryGrid, category.type, openDetails, { append: true });
        category.page = nextPage;
        category.hasMore = results.length >= 20 && cards.length > 0;
        setCategoryLoadMoreState(category.hasMore ? 'idle' : 'end');
        if (cards.length) requestAnimationFrame(() => cards[0].focus());
    } catch (error) {
        if (error?.name === 'AbortError' || !isActiveCategoryRequest(requestId, category)) return;
        console.error('[Category] Unable to load more titles:', error);
        setCategoryLoadMoreState('retry');
    } finally {
        if (requestId === activeCategoryRequestId) {
            categoryLoadMoreInFlight = false;
            DOM.categoryGrid.setAttribute('aria-busy', 'false');
            if (activeCategoryController === controller) activeCategoryController = null;
        }
    }
};

globalThis.addEventListener('hashchange', () => {
    if (globalThis.location.hash.startsWith('#category')) return;

    activeCategoryController?.abort();
    activeCategoryController = null;
    activeCategoryRequestId++;
    categoryLoadMoreInFlight = false;
    DOM.categoryGrid.setAttribute('aria-busy', 'false');
    if (DOM.categoryLoadMore.dataset.state === 'loading') {
        setCategoryLoadMoreState(currentFullCategory?.hasMore === false ? 'end' : 'idle');
    }
});

function initSearch() {
    let timeoutId;
    let requestId = 0;
    let activeController = null;

    const cancelSearch = () => {
        requestId++;
        clearTimeout(timeoutId);
        activeController?.abort();
        activeController = null;
    };

    DOM.searchInput.addEventListener('input', (e) => {
        cancelSearch();
        const currentRequestId = requestId;
        const term = e.target.value.trim();
        if (term.length < 3) {
            DOM.searchGrid.innerHTML = '';
            return;
        }
        timeoutId = setTimeout(async () => {
            const controller = new AbortController();
            activeController = controller;
            DOM.searchGrid.innerHTML = '<div class="search-state" role="status"><i class="fa-solid fa-spinner fa-spin"></i> Searching...</div>';

            try {
                const searchUrl = `/search/multi?query=${encodeURIComponent(term)}&page=1`;
                const results = await fetchFromTMDB(searchUrl, { signal: controller.signal });
                if (currentRequestId !== requestId || DOM.searchInput.value.trim() !== term) return;

                const valid = results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');
                renderGridItems(valid, DOM.searchGrid, 'movie', openDetails);
                if (!valid.length) {
                    DOM.searchGrid.innerHTML = '<div class="search-state" role="status">No matching movies or TV shows.</div>';
                }
            } catch (error) {
                if (error?.name === 'AbortError' || currentRequestId !== requestId) return;
                DOM.searchGrid.innerHTML = '<div class="search-state search-state-error" role="alert">Search is temporarily unavailable. Please try again.</div>';
            } finally {
                if (activeController === controller) activeController = null;
            }
        }, 500);
    });

    globalThis.addEventListener('hashchange', () => {
        if (!globalThis.location.hash.startsWith('#search')) cancelSearch();
    });
}

function setupDpadLogic() {
    const directionalKeys = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Up','Down','Left','Right']);
    const pressedKeys = new Set();
    const releaseTimers = new Map();

    const releaseKey = key => {
        pressedKeys.delete(key);
        clearTimeout(releaseTimers.get(key));
        releaseTimers.delete(key);
    };

    const scheduleRelease = (key, delayMs = 260) => {
        clearTimeout(releaseTimers.get(key));
        releaseTimers.set(key, setTimeout(() => releaseKey(key), delayMs));
    };

    const releaseAllKeys = () => {
        [...pressedKeys].forEach(releaseKey);
    };

    document.addEventListener('keydown', (e) => {
        const tagName = e.target?.tagName || '';
        const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA';
        const isEditableText = isInput && !e.target.readOnly && !e.target.disabled;
        
        if (e.key === 'Escape' || e.key === 'Backspace') {
            if (isInput && e.target.value.length > 0) return; // Allow backspace in input
            
            // If in details/links/player, go back
            const hash = globalThis.location.hash;
            if (hash && hash !== '#home' && hash !== '#movies' && hash !== '#tv') {
                globalThis.history.back();
                e.preventDefault();
            }
            return;
        }

        if (directionalKeys.has(e.key)) {
            if (e.defaultPrevented) return;
            if (e.repeat || pressedKeys.has(e.key)) {
                scheduleRelease(e.key);
                e.preventDefault();
                return;
            }
            pressedKeys.add(e.key);
            scheduleRelease(e.key, 500);
            if (isEditableText && ['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            NavigationManager.handleDpad(e);
        }
        
        if (e.key === 'Enter') {
            if (document.activeElement?.click) {
                // Pre-click feedback if needed
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        if (directionalKeys.has(e.key)) {
            releaseKey(e.key);
        }
    });

    globalThis.addEventListener('blur', releaseAllKeys);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) releaseAllKeys();
    });
}

function forceInitialFireTvPaint() {
    const activeElement = document.activeElement;
    document.body.style.opacity = '0.999';
    void document.body.offsetHeight;

    requestAnimationFrame(() => {
        document.body.style.opacity = '1';
        const paintTarget = document.querySelector('.nav-tab:not(.active):not(.hidden)');
        if (paintTarget && activeElement && activeElement !== document.body) {
            paintTarget.focus({ preventScroll: true });
            requestAnimationFrame(() => activeElement.focus({ preventScroll: true }));
        }
        globalThis.dispatchEvent(new Event('resize'));
        if (globalThis.NativeBridge && typeof globalThis.NativeBridge.appReady === 'function') {
            globalThis.NativeBridge.appReady();
        }
    });
}

function initApp() {
    if (DOM.seasonTabs) enableDragScroll(DOM.seasonTabs);
    if (DOM.episodeList) enableDragScroll(DOM.episodeList);
    
    initProfiles();
    initProfileBindings();
    initSearch();
    setupDpadLogic();
    setupRouter();
    
    // Settings Binding
    const settingClearCache = document.getElementById('setting-clear-cache');
    if (settingClearCache) {
        settingClearCache.onclick = async () => {
            settingClearCache.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Purging...';
            globalThis.indexedDB.deleteDatabase(CACHE_DB_NAME);
            setTimeout(() => settingClearCache.innerHTML = '<i class="fa-solid fa-check"></i> Purged Successfully', 800);
            setTimeout(() => settingClearCache.innerHTML = '<i class="fa-solid fa-database"></i> Purge API Cache', 2500);
        };
    }
    
    const settingCheckUpdate = document.getElementById('setting-check-update');
    if (settingCheckUpdate) {
        settingCheckUpdate.onclick = async () => {
            settingCheckUpdate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';
            try {
                const HOST = getProxyHost();
                const res = await fetch(`${HOST}/api/ota`, buildBackendFetchOptions(HOST, { method: 'GET', cache: 'no-cache' }));
                if (!res.ok) throw new Error("OTA version check failed: upstream unreachable");
                const data = await res.json();
                
                if (data.backend_url) {
                    rememberDiscoveredBackendHost(data.backend_url);
                }

                if (data.version && APP_VERSION < data.version) {
                    showUpdateBanner(data.version, data.url);
                    settingCheckUpdate.innerHTML = '<i class="fa-solid fa-check"></i> Update Found!';
                } else {
                    settingCheckUpdate.innerHTML = '<i class="fa-solid fa-check"></i> You are up to date';
                }
            } catch(e) {
                console.error("[Update] Manual check failed:", e.message);
                settingCheckUpdate.innerHTML = '<i class="fa-solid fa-xmark"></i> Server Unreachable';
            }
            setTimeout(() => settingCheckUpdate.innerHTML = '<i class="fa-solid fa-download"></i> Check for Updates', 3000);
        };
    }

    // New Connectivity Settings (v77)
    const backendInput = document.getElementById('setting-backend-input');
    const saveBackendBtn = document.getElementById('setting-save-backend');
    const copyLogsBtn = document.getElementById('setting-copy-logs');

    if (backendInput) backendInput.value = getManualBackendHost();
    
    if (saveBackendBtn) {
        saveBackendBtn.onclick = async () => {
            const val = backendInput.value.trim();
            setManualBackendHost(val);
            saveBackendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testing';
            await discoverBackendHost({ force: true });
            saveBackendBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
            setTimeout(() => saveBackendBtn.innerText = 'Save', 1500);
        };
    }

    if (copyLogsBtn) {
        copyLogsBtn.onclick = () => {
            const logs = getDiscoveryLogs();
            navigator.clipboard.writeText(logs).then(() => {
                copyLogsBtn.innerHTML = '<i class="fa-solid fa-check"></i> Logs Copied';
                setTimeout(() => copyLogsBtn.innerHTML = '<i class="fa-solid fa-clipboard-list"></i> Copy Debug Logs', 2000);
            }).catch(() => {
                alert("Failed to copy logs to clipboard. Check dev console.");
            });
        };
    }

    const playbackSettings = getPlaybackSettings();
    if (DOM.sourcePreferenceSelect) {
        DOM.sourcePreferenceSelect.value = playbackSettings.sourcePreference;
        DOM.sourcePreferenceSelect.onchange = () => {
            savePlaybackSettings({ sourcePreference: DOM.sourcePreferenceSelect.value });
        };
    }

    if (DOM.directSourceEndpointInput) {
        DOM.directSourceEndpointInput.value = playbackSettings.directSourceEndpoint || '';
        DOM.directSourceEndpointInput.onchange = () => {
            savePlaybackSettings({ directSourceEndpoint: DOM.directSourceEndpointInput.value.trim() });
        };
        DOM.directSourceEndpointInput.onkeydown = event => {
            if (event.key === 'Enter') {
                savePlaybackSettings({ directSourceEndpoint: DOM.directSourceEndpointInput.value.trim() });
                DOM.directSourceEndpointInput.blur();
            }
        };
    }

    if (DOM.autoplaySourcesToggle) {
        DOM.autoplaySourcesToggle.checked = playbackSettings.autoplaySources;
        DOM.autoplaySourcesToggle.onchange = () => {
            savePlaybackSettings({ autoplaySources: DOM.autoplaySourcesToggle.checked });
        };
    }

    if (DOM.autoplayNextEpisodeToggle) {
        DOM.autoplayNextEpisodeToggle.checked = playbackSettings.autoplayNextEpisode;
        DOM.autoplayNextEpisodeToggle.onchange = () => {
            savePlaybackSettings({ autoplayNextEpisode: DOM.autoplayNextEpisodeToggle.checked });
        };
    }

    if (DOM.includeBackupSourcesToggle) {
        DOM.includeBackupSourcesToggle.checked = playbackSettings.includeBackupSources;
        DOM.includeBackupSourcesToggle.onchange = () => {
            savePlaybackSettings({ includeBackupSources: DOM.includeBackupSourcesToggle.checked });
        };
    }

    if (DOM.resetSourceHealthBtn) {
        DOM.resetSourceHealthBtn.onclick = () => {
            resetSourceHealth();
            DOM.resetSourceHealthBtn.innerHTML = '<i class="fa-solid fa-check"></i> Source History Reset';
            setTimeout(() => {
                DOM.resetSourceHealthBtn.innerHTML = '<i class="fa-solid fa-broom"></i> Reset Source History';
            }, 1800);
        };
    }

    const refreshPlaybackDiagnostics = () => {
        if (DOM.playbackDiagnostics) {
            DOM.playbackDiagnostics.textContent = getPlaybackDiagnosticsText();
        }
    };

    if (DOM.refreshPlaybackDiagnosticsBtn) {
        DOM.refreshPlaybackDiagnosticsBtn.onclick = () => {
            refreshPlaybackDiagnostics();
            DOM.refreshPlaybackDiagnosticsBtn.innerHTML = '<i class="fa-solid fa-check"></i> Refreshed';
            setTimeout(() => {
                DOM.refreshPlaybackDiagnosticsBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Refresh Playback Diagnostics';
            }, 1500);
        };
    }

    if (DOM.copyPlaybackDiagnosticsBtn) {
        DOM.copyPlaybackDiagnosticsBtn.onclick = () => {
            copyPlaybackDiagnostics().then(() => {
                DOM.copyPlaybackDiagnosticsBtn.innerHTML = '<i class="fa-solid fa-check"></i> Playback Diagnostics Copied';
                setTimeout(() => {
                    DOM.copyPlaybackDiagnosticsBtn.innerHTML = '<i class="fa-solid fa-clipboard-list"></i> Copy Playback Diagnostics';
                }, 2000);
            }).catch(() => {
                refreshPlaybackDiagnostics();
                DOM.copyPlaybackDiagnosticsBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Clipboard Unavailable';
            });
        };
    }

    globalThis.addEventListener('streamy-playback-diagnostics-updated', refreshPlaybackDiagnostics);

    DOM.navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
             const view = tab.dataset.view;
             if(view === 'settings') DOM.settingsTab?.click(); 
             navigateTo(`#${view}`);
             if (view === 'settings') setTimeout(refreshPlaybackDiagnostics, 100);
        });
        tab.addEventListener('keydown', (e) => { if(e.key==='Enter') tab.click(); });
    });
    
    DOM.switchProfileTab.onclick = () => {
        showProfilesScreen({ editing: false, focusFirst: true });
    };
    
    // Bind dynamic filter drop-down
    DOM.genreFilter.addEventListener('change', async (e) => {
        const renderToken = ++activeRowsRenderToken;
        const val = e.target.value;
        DOM.rowsContainer.innerHTML = '<h2 style="color:#aaa;text-align:center;padding:100px;">Loading titles...</h2>'; // Fast clearer
        const type = e.target.dataset.mediaType === 'tv' ? 'tv' : 'movie';
        
        if (!val) {
            if(type === 'tv') loadTVRows(); else loadMovieRows();
            return;
        }
        
        const [page1, page2] = await Promise.all([
             discoverByCategory(type, val, 1),
             discoverByCategory(type, val, 2)
        ]);
        if (renderToken !== activeRowsRenderToken) return;
        const combined = [...page1, ...page2].slice(0, 33);
        
        const label = e.target.options[e.target.selectedIndex].text;
        DOM.rowsContainer.innerHTML = '';
        if(combined.length > 0) {
            buildRow({ title: `${label} - Top Picks`, items: combined.slice(0, 11), typeFallback: type, isFirstRow: true, onCardClick: openDetails });
            focusFirstRowCard(renderToken);
        }
        if(combined.length >= 12) {
            buildRow({ title: `${label} - Trending`, items: combined.slice(11, 22), typeFallback: type, onCardClick: openDetails });
            focusFirstRowCard(renderToken);
        }
        if(combined.length >= 23) {
            buildRow({ title: `${label} - More Like This`, items: combined.slice(22, 33), typeFallback: type, categoryVal: val, onCardClick: openDetails, onViewAllClick: openCategoryView });
            focusFirstRowCard(renderToken);
        }
    });
    
    globalThis.addEventListener('load-movie-rows', () => {
        updateFilterDropdown('movies');
        loadMovieRows();
    });
    globalThis.addEventListener('load-tv-rows', () => {
        updateFilterDropdown('tv');
        loadTVRows();
    });
    globalThis.addEventListener('load-watchlist-rows', () => {
        updateFilterDropdown('watchlist');
        loadWatchlist();
    });
    globalThis.addEventListener('watchlist-updated', () => {
        if (globalThis.location.hash === '#watchlist') {
            loadWatchlist();
        }
    });
    
    // Backend discovery runs independently while the initial route paints.
    discoverBackendHost(); // Start discovery in background
    forceInitialFireTvPaint();
    setTimeout(forceInitialFireTvPaint, 750);
}

document.addEventListener('DOMContentLoaded', initApp);
