import { DOM, buildRow, renderGridItems, enableDragScroll } from './ui.js?v=70';
import { discoverByCategory, discoverBackendHost, getProxyHost, setManualBackendHost, getDiscoveryLogs } from './api.js?v=70';
import { openDetails } from './player.js?v=70';
import { setupRouter, navigateTo } from './router.js?v=70';
import { NavigationManager } from './navigation.js?v=70';

let activeProfile = null;
let currentFullCategory = null; // { type: 'movie', val: '28', page: 1, title: 'Action' }

// Navigation Manager is now imported

const APP_VERSION = 84;
const UPDATE_SERVER = 'https://streamy-vez5.onrender.com';

async function checkForUpdatesBackground() {
    try {
        const HOST = getProxyHost();
        console.log(`[Discovery] Validating backend via ${HOST}...`);
        
        const res = await fetch(`${HOST}/api/ota`, { 
            method: 'GET', 
            cache: 'no-cache',
            headers: { 'bypass-tunnel-reminder': 'true' }
        });
        if (!res.ok) throw new Error("OTA Fetch Fail");
        
        const data = await res.json();

        // Dynamic Backend Discovery (Force Sync)
        if (data.backend_url) {
            const oldHost = globalThis.localStorage.getItem('streamy_backend_host');
            if (oldHost !== data.backend_url) {
                globalThis.localStorage.setItem('streamy_backend_host', data.backend_url);
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
    banner.style.cssText = 'position:fixed; top:20px; right:20px; background:#e50914; color:white; padding:15px; border-radius:8px; z-index:999999; display:flex; align-items:center; gap:15px; box-shadow:0 4px 15px rgba{0,0,0,0.5}; font-weight:bold; cursor:pointer; font-size:18px; border:2px solid white;';
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
    '1024': 'Amazon Prime',
    '2552': 'Paramount+',
    '3186': 'HBO Max',
    '2739': 'Disney+'
};

const MOVIE_GENRES = {
    '28': 'Action',
    '35': 'Comedy',
    '18': 'Drama',
    '27': 'Horror',
    '878': 'Sci-Fi',
    '10751': 'Family'
};

function updateFilterDropdown(type) {
    const filter = DOM.genreFilter;
    if(type === 'movies') {
        filter.innerHTML = '<option value="" style="background:#141414;">All Genres</option>';
        for(let [id, name] of Object.entries(MOVIE_GENRES)) {
             filter.innerHTML += `<option value="${id}" style="background:#141414;">${name}</option>`;
        }
        filter.classList.remove('hidden');
    } else if (type === 'tv') {
        if (activeProfile?.isKid) {
            filter.innerHTML = `
                <option value="" style="background:#141414;">All Kids Shows</option>
                <optgroup label="Kids Networks" style="background:#141414; color:#aaa;">
                    <option value="company:165435" style="background:#141414; color:#d4af37;">Angel Studios Kids</option>
                    <option value="company:73756" style="background:#141414; color:#28b24b;">PBS Kids</option>
                    <option value="network:2739|84|1220" style="background:#141414; color:white;">Disney Channel</option>
                    <option value="network:247" style="background:#141414; color:white;">YouTube Kids</option>
                    <option value="network:13|35" style="background:#141414; color:white;">Nick Jr.</option>
                    <option value="network:156|361" style="background:#141414; color:white;">Cartoon Network</option>
                </optgroup>
            `;
        } else {
            filter.innerHTML = '<option value="" style="background:#141414;">All Networks</option>';
            filter.innerHTML += `<option value="16" style="background:#141414;">Animation</option>`;
            for(let [id, name] of Object.entries(TV_NETWORKS)) {
                 filter.innerHTML += `<option value="network:${id}" style="background:#141414;">${name}</option>`;
            }
        }
        filter.classList.remove('hidden');
    } else {
        filter.classList.add('hidden');
    }
}

// Profiles System
function getProfiles() {
    return JSON.parse(globalThis.localStorage.getItem('streamy_profiles') || '[]');
}
function saveProfiles(profiles) {
    globalThis.localStorage.setItem('streamy_profiles', JSON.stringify(profiles));
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
        if (!profiles.some(p => p.id === m.id)) {
            profiles.push(m);
            profilesUpdated = true;
        }
    });

    if (profilesUpdated) saveProfiles(profiles);
    
    const activeId = globalThis.localStorage.getItem('streamy_active_profile');
    if (activeId) {
        activeProfile = profiles.find(p => p.id === activeId);
    }
    if (!activeProfile) activeProfile = profiles[0];
    
    const activeIndex = profiles.findIndex(p => p.id === activeProfile.id);
    renderProfilesScreen(profiles, activeIndex);
    
    document.getElementById('edit-profiles-btn').onclick = () => {
        const grid = document.getElementById('profiles-grid');
        const isEditing = grid.classList.toggle('edit-mode');
        document.getElementById('edit-profiles-btn').innerHTML = isEditing ? '<i class="fa-solid fa-check"></i> Done Editing' : '<i class="fa-solid fa-pen"></i> Manage Profiles';
        renderProfilesScreen(getProfiles(), -1, isEditing);
    };

    document.getElementById('add-profile-btn').onclick = () => openProfileModal(null);
    DOM.settingManageProfiles.onclick = () => {
        document.getElementById('profile-selection-screen').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
        DOM.topBar.classList.add('hidden');
        document.getElementById('edit-profiles-btn').click();
    };

    document.getElementById('cancel-profile-btn').onclick = () => {
        document.getElementById('profile-edit-modal').classList.add('hidden');
    };

    document.getElementById('add-profile-btn').style.display = 'none';
    const versionEl = document.getElementById('setting-build-version');
    if (versionEl) versionEl.innerText = `${APP_VERSION}.0 (GLOBAL SYNC SUCCESS)`;
    
    checkForUpdatesBackground();
}

function renderProfilesScreen(profiles, focusIndex = 0, isEditing = false) {
    const grid = document.getElementById('profiles-grid');
    grid.innerHTML = '';
    
    profiles.forEach((p, idx) => {
        const card = document.createElement('button');
        card.className = `profile-card ${isEditing ? 'edit-mode' : ''}`;
        card.tabIndex = 0;
        card.style.background = 'transparent'; card.style.border = 'none'; card.style.color = 'white';
        
        // Use basic fallback for avatar SVGs 
        const svgContent = `<i class="fa-solid fa-user"></i>`;
        
        card.innerHTML = `
            <div class="profile-avatar">${svgContent}${p.isKid ? '<span class="kid-badge">KIDS</span>' : ''}</div>
            <div style="font-size: 1.5rem; font-weight: bold; text-shadow: 1px 1px 3px black;">${p.name}</div>
        `;
        
        card.onclick = () => {
            if (isEditing) { openProfileModal(p); }
            else { selectProfile(p); }
        };
        card.onkeydown = (e) => { if(e.key === 'Enter') card.click(); };
        grid.appendChild(card);
        
        if (focusIndex === idx) setTimeout(() => card.focus(), 100);
    });

    NavigationManager.lockFocus('#profile-selection-screen');
}

function openProfileModal(profile) {
    const modal = document.getElementById('profile-edit-modal');
    const title = document.getElementById('modal-profile-title');
    const input = document.getElementById('profile-name-input');
    const isKid = document.getElementById('profile-kid-checkbox');
    const saveBtn = document.getElementById('save-profile-btn');
    const delBtn = document.getElementById('delete-profile-btn');
    
    modal.dataset.editingId = profile ? profile.id : '';
    title.textContent = profile ? 'Edit Profile' : 'Add Profile';
    input.value = profile ? profile.name : '';
    isKid.checked = profile ? !!profile.isKid : false;
    
    // Lock the "Is Kid" checkbox ONLY for mandatory profiles
    const mandatoryIds = new Set(['profile_adult', 'profile_kids']);
    isKid.disabled = profile && mandatoryIds.has(profile.id);
    
    // Show Add Profile button
    document.getElementById('add-profile-btn').style.display = 'block';
    
    // Manage Delete button: Hide for mandatory profiles
    if (profile && !mandatoryIds.includes(profile.id)) delBtn.classList.remove('hidden');
    else delBtn.classList.add('hidden');
    
    // Ensure "Manage Profiles" from settings is visible
    DOM.settingManageProfiles.style.display = 'flex';
    
    // Simulate Avatar Selection Grid
    document.getElementById('avatar-selection-grid').innerHTML = `
        <button class="nav-tab active" style="font-size:3rem; padding:10px;"><i class="fa-solid fa-user"></i></button>
        <button class="nav-tab" style="font-size:3rem; padding:10px;"><i class="fa-solid fa-ghost"></i></button>
        <button class="nav-tab" style="font-size:3rem; padding:10px;"><i class="fa-solid fa-robot"></i></button>
    `;

    saveBtn.onclick = () => {
        if (!input.value.trim()) return;
        let profiles = getProfiles();
        if (profile) {
            const index = profiles.findIndex(x => x.id === profile.id);
            if (index > -1) {
                profiles[index].name = input.value.trim();
                profiles[index].isKid = isKid.checked;
            }
        } else {
            profiles.push({ id: Date.now().toString(), name: input.value.trim(), avatar: '1', isKid: isKid.checked });
        }
        saveProfiles(profiles);
        modal.classList.add('hidden');
        renderProfilesScreen(profiles, -1, true);
    };

    delBtn.onclick = () => {
        let profiles = getProfiles();
        profiles = profiles.filter(x => x.id !== profile.id);
        if (activeProfile && activeProfile.id === profile.id) activeProfile = profiles[0];
        saveProfiles(profiles);
        modal.classList.add('hidden');
        renderProfilesScreen(profiles, -1, true);
    };

    modal.classList.remove('hidden');
    input.focus();
    NavigationManager.lockFocus('#profile-edit-modal');
}

// Removed redundant fetchTMDB function

function selectProfile(profile) {
    activeProfile = profile;
    globalThis.localStorage.setItem('streamy_active_profile', profile.id);
    document.getElementById('current-profile-name').textContent = profile.name;
    document.getElementById('profile-selection-screen').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    DOM.topBar.classList.remove('hidden');
    
    // We explicitly re-enable the genre-filter for Kids so they can access Angel Studios and Animation networks!
    document.getElementById('genre-filter').classList.remove('hidden');
    document.getElementById('genre-filter').value = '';
    
    loadMovieRows();
}

// Data Fetching and Rows Array
async function loadMovieRows() {
    DOM.rowsContainer.innerHTML = '';
    // Fetch History first
    const histKey = 'streamy_history_' + (activeProfile ? activeProfile.id : 'default');
    let hList = JSON.parse(globalThis.localStorage.getItem(histKey) || '[]');
    if(hList.length > 0) buildRow({ title: 'Continue Watching', items: hList, isWatchlistDict: true, typeFallback: 'movie', isFirstRow: true, onCardClick: openDetails });

    const trending = await discoverByCategory('movie', 'trending', 1);
    buildRow({ title: 'Trending Now', items: trending, typeFallback: 'movie', isFirstRow: hList.length === 0, categoryVal: 'trending', onCardClick: openDetails, onViewAllClick: openCategoryView });
    
    // Asynchronous loading
    discoverByCategory('movie', '28', 1).then(action => {
        buildRow({ title: 'Action Blockbusters', items: action, typeFallback: 'movie', categoryVal: '28', onCardClick: openDetails, onViewAllClick: openCategoryView });
    });
    discoverByCategory('movie', '35', 1).then(comedy => {
        buildRow({ title: 'Comedy Gold', items: comedy, typeFallback: 'movie', categoryVal: '35', onCardClick: openDetails, onViewAllClick: openCategoryView });
    });
}

async function loadTVRows() {
    DOM.rowsContainer.innerHTML = '';
    const trending = await discoverByCategory('tv', 'trending', 1);
    buildRow({ title: 'Trending Series', items: trending, typeFallback: 'tv', isFirstRow: true, categoryVal: 'trending', onCardClick: openDetails, onViewAllClick: openCategoryView });
    
    discoverByCategory('tv', '18', 1).then(action => {
        buildRow({ title: 'Binge-Worthy Dramas', items: action, typeFallback: 'tv', categoryVal: '18', onCardClick: openDetails, onViewAllClick: openCategoryView });
    });
    discoverByCategory('tv', 'network:213', 1).then(comedy => {
        buildRow({ title: 'Netflix Originals', items: comedy, typeFallback: 'tv', categoryVal: 'network:213', onCardClick: openDetails, onViewAllClick: openCategoryView });
    });
}

function loadWatchlist() {
    DOM.rowsContainer.innerHTML = '';
    const watchKey = 'streamy_watchlist_' + (activeProfile ? activeProfile.id : 'default');
    let list = JSON.parse(globalThis.localStorage.getItem(watchKey) || '[]');
    if(list.length > 0) buildRow({ title: 'My Watchlist', items: list, isWatchlistDict: true, typeFallback: 'movie', isFirstRow: true, categoryVal: 'watchlist', onCardClick: openDetails });
    else DOM.rowsContainer.innerHTML = '<h2 style="padding: 100px; text-align:center; color:#555;">No Titles in Watchlist</h2>';
}

async function openCategoryView(title, val, typeFallback) {
    currentFullCategory = { type: typeFallback, val: val, page: 1, title: title };
    DOM.viewCategoryTitle.textContent = title;
    DOM.categoryGrid.innerHTML = '<div style="color:#aaa;">Loading...</div>';
    navigateTo('#category');
    
    let results = [];
    if (val === 'trending') results = await discoverByCategory(typeFallback, 'trending', 1);
    else results = await discoverByCategory(typeFallback, val, 1);
    renderGridItems(results, DOM.categoryGrid, typeFallback, openDetails);
    
    DOM.categoryGrid.firstChild?.focus();
}

DOM.categoryLoadMore.onclick = async () => {
    if (!currentFullCategory) return;
    currentFullCategory.page++;
    
    let results = [];
    if (currentFullCategory.val === 'trending') results = await discoverByCategory(currentFullCategory.type, 'trending', currentFullCategory.page);
    else results = await discoverByCategory(currentFullCategory.type, currentFullCategory.val, currentFullCategory.page);
    
    // Append to grid naturally without losing focus
    results.forEach(item => {
        let parsed = { // minimal parse inline for simplicity
             id: item.id || item.tmdbId,
             type: currentFullCategory.type,
             title: item.title || item.name,
             year: String(item.release_date || item.first_air_date || item.year || "2024").split('-')[0],
             poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
             backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
             desc: item.overview,
             rating: item.vote_average ? `${item.vote_average.toFixed(1)}/10 Match` : 'New'
        };
        if(!parsed.poster) return;
        const card = document.createElement('div');
        card.className = 'poster-card'; card.tabIndex = 0;
        card.innerHTML = `<img loading="lazy" src="${parsed.poster}" alt="${parsed.title}">`;
        card.onclick = () => openDetails(parsed);
        card.onkeydown = (e) => { if(e.key === 'Enter') card.click(); };
        DOM.categoryGrid.appendChild(card);
    });
};

function initSearch() {
    let timeoutId;
    DOM.searchInput.addEventListener('input', (e) => {
        clearTimeout(timeoutId);
        const term = e.target.value.trim();
        if (term.length < 3) {
            DOM.searchGrid.innerHTML = '';
            return;
        }
        timeoutId = setTimeout(async () => {
            let searchUrl = `/search/multi?query=${encodeURIComponent(term)}&page=1`;
            const results = await fetchFromTMDB(searchUrl);
            const valid = results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');
            
            // For Kids, we perform a secondary discovery-based filter if possible, 
            // or just ensure adult content is definitely out.
            renderGridItems(valid, DOM.searchGrid, 'movie', openDetails);
        }, 500);
    });
}

function setupDpadLogic() {
    document.addEventListener('keydown', (e) => {
        const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
        
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

        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Up','Down','Left','Right'].includes(e.key)) {
            NavigationManager.handleDpad(e);
        }
        
        if (e.key === 'Enter') {
            if (document.activeElement?.click) {
                // Pre-click feedback if needed
            }
        }
    });
}

function initApp() {
    enableDragScroll(DOM.seasonTabs);
    enableDragScroll(DOM.episodeList);
    
    initProfiles();
    initSearch();
    setupDpadLogic();
    setupRouter();
    
    // Settings Binding
    const settingClearCache = document.getElementById('setting-clear-cache');
    if (settingClearCache) {
        settingClearCache.onclick = async () => {
            settingClearCache.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Purging...';
            globalThis.indexedDB.deleteDatabase('StreamOS_CacheDB');
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
                const res = await fetch(`${HOST}/api/ota`, { method: 'GET', cache: 'no-cache', headers: { 'bypass-tunnel-reminder': 'true' } });
                if (!res.ok) throw new Error("OTA version check failed: upstream unreachable");
                const data = await res.json();
                
                if (data.backend_url) {
                    globalThis.localStorage.setItem('streamy_backend_host', data.backend_url);
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

    if (backendInput) backendInput.value = localStorage.getItem('streamy_backend_host') || '';
    
    if (saveBackendBtn) {
        saveBackendBtn.onclick = () => {
            const val = backendInput.value.trim();
            setManualBackendHost(val);
            saveBackendBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
            setTimeout(() => saveBackendBtn.innerText = 'Save', 1500);
            discoverBackendHost(); // Immediate re-discovery
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

    DOM.navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
             const view = tab.dataset.view;
             if(view === 'settings') DOM.settingsTab.click(); 
             navigateTo(`#${view}`);
        });
        tab.addEventListener('keydown', (e) => { if(e.key==='Enter') tab.click(); });
    });
    
    document.getElementById('switch-profile-tab').onclick = () => {
        document.getElementById('profile-selection-screen').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
        DOM.topBar.classList.add('hidden');
        document.getElementById('profiles-grid').firstChild?.focus();
    };
    
    // Bind dynamic filter drop-down
    DOM.genreFilter.addEventListener('change', async (e) => {
        const val = e.target.value;
        DOM.rowsContainer.innerHTML = '<h2 style="color:#aaa;text-align:center;padding:100px;">Loading titles...</h2>'; // Fast clearer
        const isTV = DOM.genreFilter.querySelector('option[value^="network:"]') !== null;
        const type = isTV ? 'tv' : 'movie';
        
        if (!val) {
            if(isTV) loadTVRows(); else loadMovieRows();
            return;
        }
        
        const [page1, page2] = await Promise.all([
             discoverByCategory(type, val, 1),
             discoverByCategory(type, val, 2)
        ]);
        const combined = [...page1, ...page2].slice(0, 33);
        
        const label = e.target.options[e.target.selectedIndex].text;
        DOM.rowsContainer.innerHTML = '';
        if(combined.length > 0) buildRow({ title: `${label} - Top Picks`, items: combined.slice(0, 11), typeFallback: type, isFirstRow: true, onCardClick: openDetails });
        if(combined.length >= 12) buildRow({ title: `${label} - Trending`, items: combined.slice(11, 22), typeFallback: type, onCardClick: openDetails });
        if(combined.length >= 23) buildRow({ title: `${label} - More Like This`, items: combined.slice(22, 33), typeFallback: type, categoryVal: val, onCardClick: openDetails, onViewAllClick: openCategoryView });
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
    
    // First paint happens inside initProfiles -> selectProfile
    discoverBackendHost(); // Start discovery in background
}

document.addEventListener('DOMContentLoaded', initApp);
