export function setupRouter() {
    globalThis.addEventListener('hashchange', () => handleRoute());
}

export function navigateTo(hash) {
    if (globalThis.location.hash === hash) {
        handleRoute();
    } else {
        globalThis.location.hash = hash;
    }
}

export function handleRoute() {
    const hash = globalThis.location.hash || '#home';
    
    // Hide all views first
    const views = document.querySelectorAll('.view');
    views.forEach(v => v.classList.add('hidden'));
    
    const navTabs = document.querySelectorAll('.nav-tab[data-view]');
    navTabs.forEach(t => t.classList.remove('active'));

    const searchTab = document.querySelector('.nav-tab[data-view="search"]');
    const moviesTab = document.querySelector('.nav-tab[data-view="movies"]');
    const tvTab = document.querySelector('.nav-tab[data-view="tv"]');
    const watchlistTab = document.querySelector('.nav-tab[data-view="watchlist"]');
    const settingsTab = document.querySelector('.nav-tab[data-view="settings"]');
    const musicTab = document.querySelector('.nav-tab[data-view="music"]');

    // Stop video playback when leaving player view
    if (hash !== '#player') {
         const vp = document.getElementById('video-player');
         if(vp) { vp.pause(); vp.removeAttribute('src'); vp.load(); vp.style.display = 'none'; }
         const iframe = document.getElementById('fallback-iframe');
         if(iframe) { iframe.removeAttribute('src'); iframe.style.display = 'none'; }
         const overlay = document.getElementById('iframe-activation-overlay');
         if(overlay) overlay.style.display = 'none';
         const autoplayOverlay = document.getElementById('autoplay-overlay');
         if(autoplayOverlay) autoplayOverlay.style.display = 'none';
    }

    if (hash.startsWith('#search')) {
        document.body.classList.remove('video-playing');
        document.getElementById('view-search').classList.remove('hidden');
        if(searchTab) searchTab.classList.add('active');
        document.getElementById('search-input').focus();
    } else if (hash === '#player') {
        document.body.classList.add('video-playing');
        document.getElementById('view-player').classList.remove('hidden');
        const musicBar = document.getElementById('music-player-bar');
        if (musicBar) musicBar.classList.add('hidden');
    } else if (hash.startsWith('#details')) {
        document.body.classList.remove('video-playing');
        document.getElementById('view-details').classList.remove('hidden');
    } else if (hash.startsWith('#links')) {
        document.body.classList.remove('video-playing');
        document.getElementById('view-links').classList.remove('hidden');
    } else if (hash.startsWith('#category')) {
        document.body.classList.remove('video-playing');
        document.getElementById('view-category').classList.remove('hidden');
    } else if (hash.startsWith('#settings')) {
        document.body.classList.remove('video-playing');
        document.getElementById('view-settings').classList.remove('hidden');
        if(settingsTab) settingsTab.classList.add('active');
    } else if (hash.startsWith('#music')) {
        document.body.classList.remove('video-playing');
        document.getElementById('view-music').classList.remove('hidden');
        if(musicTab) musicTab.classList.add('active');
        const query = hash.includes('?') ? new URLSearchParams(hash.split('?')[1]).get('q') : '';
        globalThis.dispatchEvent(new CustomEvent('load-music-view', { detail: { query } }));
    } else if (hash === '#watchlist') {
        document.body.classList.remove('video-playing');
        document.getElementById('view-home').classList.remove('hidden');
        if(watchlistTab) watchlistTab.classList.add('active');
        globalThis.dispatchEvent(new Event('load-watchlist-rows'));
    } else if (hash === '#tv') {
        document.body.classList.remove('video-playing');
        document.getElementById('view-home').classList.remove('hidden');
        if(tvTab) tvTab.classList.add('active');
        globalThis.dispatchEvent(new Event('load-tv-rows'));
    } else {
        document.body.classList.remove('video-playing');
        // default home (movies array usually)
        document.getElementById('view-home').classList.remove('hidden');
        if(moviesTab) moviesTab.classList.add('active');
        globalThis.dispatchEvent(new Event('load-movie-rows'));
    }
    
    // Smooth scroll reset
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.scrollTop = 0;
}
