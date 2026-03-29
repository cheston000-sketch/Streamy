import { NavigationManager } from './navigation.js?v=29';

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
    NavigationManager.saveFocus(hash);

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
        '#home': { view: 'view-home', tab: 'movies', event: 'load-movie-rows' }
    };

    const routeKey = Object.keys(routeMap).find(k => hash.startsWith(k)) || '#home';
    const route = routeMap[routeKey];

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
            NavigationManager.restoreFocus(hash, '#search-input');
        } else if (hash.startsWith('#details')) {
             NavigationManager.restoreFocus(hash, '#play-btn');
        } else if (hash.startsWith('#home') || hash === '#tv' || hash === '#watchlist' || hash === '') {
             NavigationManager.restoreFocus(hash, '.poster-card');
        } else {
             NavigationManager.restoreFocus(hash);
        }
    }, 100);
}
