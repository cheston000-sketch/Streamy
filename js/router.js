import { DOM } from './ui.js?v=4';

export function setupRouter() {
    globalThis.addEventListener('hashchange', handleRoute);
}

export function navigateTo(hash) {
    globalThis.location.hash = hash;
}

export function handleRoute() {
    const hash = globalThis.location.hash || '#home';
    
    if(DOM.homeView) DOM.homeView.classList.add('hidden');
    if(DOM.searchView) DOM.searchView.classList.add('hidden');
    if(DOM.playerView) DOM.playerView.classList.add('hidden');
    if(DOM.moviesView) DOM.moviesView.classList.add('hidden');
    if(DOM.tvView) DOM.tvView.classList.add('hidden');
    if(DOM.watchlistView) DOM.watchlistView.classList.add('hidden');
    
    // Clear nav states
    if(DOM.navHome) DOM.navHome.classList.remove('active');
    if(DOM.navMovies) DOM.navMovies.classList.remove('active');
    if(DOM.navTv) DOM.navTv.classList.remove('active');
    if(DOM.navWatchlist) DOM.navWatchlist.classList.remove('active');

    // Stop video playback when leaving player view
    if (hash !== '#player') {
         if(DOM.videoPlayer) DOM.videoPlayer.src = ""; 
    }

    if (hash.startsWith('#search')) {
        if(DOM.searchView) DOM.searchView.classList.remove('hidden');
    } else if (hash.startsWith('#player')) {
        if(DOM.playerView) DOM.playerView.classList.remove('hidden');
    } else if (hash === '#watchlist') {
        if(DOM.watchlistView) DOM.watchlistView.classList.remove('hidden');
        if(DOM.navWatchlist) DOM.navWatchlist.classList.add('active');
        globalThis.dispatchEvent(new Event('watchlist-updated'));
    } else if (hash === '#movies') {
        if(DOM.moviesView) DOM.moviesView.classList.remove('hidden');
        if(DOM.navMovies) DOM.navMovies.classList.add('active');
    } else if (hash === '#tv') {
        if(DOM.tvView) DOM.tvView.classList.remove('hidden');
        if(DOM.navTv) DOM.navTv.classList.add('active');
    } else {
        // default home
        if(DOM.homeView) DOM.homeView.classList.remove('hidden');
        if(DOM.navHome) DOM.navHome.classList.add('active');
        if(DOM.trendingMoviesSection) DOM.trendingMoviesSection.classList.remove('hidden');
        if(DOM.trendingTvSection) DOM.trendingTvSection.classList.remove('hidden');
    }
}
