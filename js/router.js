import { NavigationManager } from './navigation.js?v=116';

let currentRouteKey = null;

function handleNativeBack() {
    if (globalThis.StreamOSUpdate?.isRequired?.()) {
        document.getElementById('required-update-install')?.focus();
        return 'handled';
    }

    const profileModal = document.querySelector('#profile-edit-modal:not(.hidden)');
    if (profileModal) {
        document.getElementById('cancel-profile-btn')?.click();
        return 'handled';
    }

    const profileScreen = document.querySelector('#profile-selection-screen:not(.hidden)');
    if (profileScreen) {
        const activeProfileId = globalThis.localStorage.getItem('streamy_active_profile');
        if (!activeProfileId) return 'exit';

        profileScreen.classList.add('hidden');
        document.getElementById('main-content')?.classList.remove('hidden');
        document.getElementById('top-bar')?.classList.remove('hidden');
        setTimeout(() => document.getElementById('switch-profile-tab')?.focus(), 80);
        return 'handled';
    }

    const hash = globalThis.location.hash || '#home';
    if (hash === '#home' || hash === '' || hash === '#') return 'exit';
    globalThis.history.back();
    return 'handled';
}

globalThis.StreamOSNative = globalThis.StreamOSNative || {};
globalThis.StreamOSNative.handleBack = handleNativeBack;

export function setupRouter() {
    globalThis.addEventListener('hashchange', () => handleRoute());

    const profileScreen = document.getElementById('profile-selection-screen');
    if (profileScreen && !profileScreen.classList.contains('hidden')) return;

    const initialHash = globalThis.location.hash || '#home';
    const contextDependentRoutes = ['#details', '#links', '#player', '#category'];
    if (contextDependentRoutes.some(route => initialHash.startsWith(route))) {
        globalThis.history.replaceState(null, '', '#home');
    }
    // App-level row listeners are registered later in the same initialization turn.
    setTimeout(handleRoute, 0);
}

export function navigateTo(hash) {
    if (globalThis.StreamOSUpdate?.isRequired?.()) {
        document.getElementById('required-update-install')?.focus();
        return;
    }

    if (globalThis.location.hash === hash) {
        handleRoute();
    } else {
        globalThis.location.hash = hash;
    }
}

function stopVideoPlayback() {
    const vp = document.getElementById('video-player');
    if (vp) {
        vp.pause();
        vp.removeAttribute('src');
        vp.load();
        vp.style.display = 'none';
    }
    const iframe = document.getElementById('fallback-iframe');
    if (iframe) {
        iframe.removeAttribute('src');
        iframe.style.display = 'none';
    }
    ['iframe-activation-overlay', 'autoplay-overlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function updateNavUI(activeHash) {
    const views = document.querySelectorAll('.view');
    views.forEach(v => v.classList.add('hidden'));

    const navTabs = document.querySelectorAll('.nav-tab[data-view]');
    navTabs.forEach(t => t.classList.remove('active'));

    document.body.classList.toggle('video-playing', activeHash.startsWith('#player'));
}

export function handleRoute() {
    const hash = globalThis.location.hash || '#home';

    if (hash !== '#player') stopVideoPlayback();
    updateNavUI(hash);

    const routeMap = {
        '#search': { view: 'view-search', tab: 'search', focus: 'search-input' },
        '#player': { view: 'view-player' },
        '#details': { view: 'view-details' },
        '#links': { view: 'view-links' },
        '#category': { view: 'view-category' },
        '#settings': { view: 'view-settings', tab: 'settings' },
        '#watchlist': { view: 'view-home', tab: 'watchlist', event: 'load-watchlist-rows' },
        '#tv': { view: 'view-home', tab: 'tv', event: 'load-tv-rows' },
        '#movies': { view: 'view-home', tab: 'movies', event: 'load-movie-rows' },
        '#home': { view: 'view-home', tab: 'movies', event: 'load-movie-rows' }
    };

    const routeKey = Object.keys(routeMap).find(k => hash.startsWith(k)) || '#home';
    const route = routeMap[routeKey];
    if (currentRouteKey && currentRouteKey !== routeKey) {
        NavigationManager.saveFocus(currentRouteKey);
    }
    currentRouteKey = routeKey;

    const viewEl = document.getElementById(route.view);
    if (viewEl) viewEl.classList.remove('hidden');

    if (route.tab) {
        const tab = document.querySelector(`.nav-tab[data-view="${route.tab}"]`);
        if (tab) tab.classList.add('active');
    }

    if (route.event) globalThis.dispatchEvent(new Event(route.event));
    if (route.focus) document.getElementById(route.focus)?.focus();
    
    // Smooth scroll reset
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.scrollTop = 0;

    // Restore or set default focus
    setTimeout(() => {
        if (hash.startsWith('#search')) {
            NavigationManager.restoreFocus(routeKey, '#search-input');
        } else if (hash.startsWith('#details')) {
             NavigationManager.restoreFocus(routeKey, '#play-btn');
        } else if (hash.startsWith('#links')) {
             NavigationManager.restoreFocus(routeKey, '.server-btn');
        } else if (hash.startsWith('#category')) {
             NavigationManager.restoreFocus(routeKey, '#category-grid .poster-card');
        } else if (hash.startsWith('#settings')) {
             NavigationManager.restoreFocus(routeKey, '#setting-backend-input');
        } else if (hash.startsWith('#player')) {
             NavigationManager.restoreFocus(routeKey, '#player-back-btn');
        } else if (routeKey === '#home' || routeKey === '#movies' || routeKey === '#tv' || routeKey === '#watchlist') {
             NavigationManager.restoreFocus(routeKey, '.poster-card');
        } else {
             NavigationManager.restoreFocus(routeKey);
        }
    }, 100);
}
