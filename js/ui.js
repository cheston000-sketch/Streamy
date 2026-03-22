import { IMAGE_URL, BACKDROP_URL } from './api.js?v=4';

export const DOM = {
    homeView: document.getElementById('home-view'),
    searchView: document.getElementById('search-view'),
    playerView: document.getElementById('player-view'),
    moviesView: document.getElementById('movies-view'),
    tvView: document.getElementById('tv-view'),
    moviesGrid: document.getElementById('movies-grid'),
    tvGrid: document.getElementById('tv-grid'),
    movieCategory: document.getElementById('movie-category'),
    tvCategory: document.getElementById('tv-category'),
    trendingMoviesGrid: document.getElementById('trending-movies-grid'),
    trendingTvGrid: document.getElementById('trending-tv-grid'),
    searchResultsGrid: document.getElementById('search-results-grid'),
    trendingMoviesSection: document.getElementById('trending-movies-section'),
    trendingTvSection: document.getElementById('trending-tv-section'),
    customFullscreenBtn: document.getElementById('custom-fullscreen-btn'),
    iframeWrapper: document.querySelector('.iframe-wrapper'),
    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    navHome: document.getElementById('nav-home'),
    navMovies: document.getElementById('nav-movies'),
    navTv: document.getElementById('nav-tv'),
    navWatchlist: document.getElementById('nav-watchlist'),
    watchlistView: document.getElementById('watchlist-view'),
    watchlistGrid: document.getElementById('watchlist-grid'),
    
    // Hero
    heroSection: document.getElementById('hero-section'),
    heroTitle: document.getElementById('hero-title'),
    heroDesc: document.getElementById('hero-desc'),
    heroMeta: document.getElementById('hero-meta'),
    heroWatchBtn: document.getElementById('hero-watch-btn'),

    // Player
    playerTitle: document.getElementById('player-title'),
    videoPlayer: document.getElementById('video-player'),
    tvControls: document.getElementById('tv-controls'),
    episodeSelect: document.getElementById('episode-select'),
    loadEpisodeBtn: document.getElementById('load-episode-btn'),
    playerWatchlistBtn: document.getElementById('player-watchlist-btn'),
    tvFullscreenBtn: document.getElementById('tv-fullscreen-btn')
};

export function enableDragScroll(slider) {
    if(!slider) return;
    let isDown = false;
    let startX;
    let scrollLeft;

    slider.style.cursor = 'grab';
    
    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        slider.style.cursor = 'grabbing';
        slider.classList.add('drag-override');
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
    });
    slider.addEventListener('mouseleave', () => {
        isDown = false;
        slider.style.cursor = 'grab';
        slider.classList.remove('is-dragging');
        slider.classList.remove('drag-override');
    });
    slider.addEventListener('mouseup', () => {
        isDown = false;
        slider.style.cursor = 'grab';
        setTimeout(() => slider.classList.remove('is-dragging'), 50);
        slider.classList.remove('drag-override');
    });
    slider.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - slider.offsetLeft;
        const walk = (x - startX) * 2;
        if (Math.abs(walk) > 5) {
            slider.classList.add('is-dragging');
        }
        slider.scrollLeft = scrollLeft - walk;
    });
    slider.addEventListener('click', (e) => {
        if (slider.classList.contains('is-dragging')) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}

export function isInWatchlist(id) {
    const list = JSON.parse(globalThis.localStorage.getItem('streamy_watchlist') || '[]');
    return list.some(x => x.id === id);
}

export function toggleWatchlist(item, btnElement, isTextNode = false) {
    let list = JSON.parse(globalThis.localStorage.getItem('streamy_watchlist') || '[]');
    const index = list.findIndex(x => x.id === item.id);
    if (index > -1) {
        list.splice(index, 1);
        if(btnElement) {
            btnElement.innerHTML = isTextNode ? '<i class="fa-solid fa-plus"></i> Add to List' : '<i class="fa-solid fa-plus"></i>';
            btnElement.classList.remove('added');
        }
    } else {
        list.push(item);
        if(btnElement) {
            btnElement.innerHTML = isTextNode ? '<i class="fa-solid fa-check"></i> Added' : '<i class="fa-solid fa-check"></i>';
            btnElement.classList.add('added');
        }
    }
    globalThis.localStorage.setItem('streamy_watchlist', JSON.stringify(list));
    globalThis.dispatchEvent(new Event('watchlist-updated'));
}

export function updateHero(item, onWatchClick) {
    if(!item) return;
    const title = item.title || item.name;
    const year = (item.release_date || item.first_air_date || '2026').substring(0,4);
    DOM.heroTitle.innerText = title;
    DOM.heroDesc.innerText = item.overview || "An exciting cinematic adventure.";
    DOM.heroMeta.innerHTML = `
        <span><i class="fa-solid fa-star"></i> ${item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}</span>
        <span>${year}</span>
        <span>${item.media_type === 'tv' ? 'TV Show' : 'Movie'}</span>
    `;
    DOM.heroSection.style.backgroundImage = `url(${BACKDROP_URL}${item.backdrop_path})`;
    
    DOM.heroWatchBtn.onclick = () => onWatchClick(item);
}

export function createCard(item, typeOverride, onClick) {
    const type = typeOverride || item.media_type || (item.name ? 'tv' : 'movie');
    const title = item.title || item.name;
    const year = (item.release_date || item.first_air_date || 'N/A').substring(0,4);
    const poster = item.poster_path ? `${IMAGE_URL}${item.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image';
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';

    const card = document.createElement('div');
    card.className = 'card';
    card.tabIndex = 0; // Essential for TV D-Pad Spatial Navigation
    card.innerHTML = `
        <img src="${poster}" alt="${title}" loading="lazy">
        <div class="card-overlay">
            <div class="play-button"><i class="fa-solid fa-play"></i></div>
        </div>
        <div class="card-content">
            <h3 class="card-title">${title}</h3>
            <div class="card-meta">
                <span>${year}</span>
                <span><i class="fa-solid fa-star" style="color: #F5C518;"></i> ${rating}</span>
                <span>${type === 'tv' ? 'TV' : 'Movie'}</span>
            </div>
        </div>
    `;

    card.addEventListener('click', () => {
        item.media_type = type;
        onClick(item);
    });
    
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            item.media_type = type;
            onClick(item);
        }
    });

    return card;
}
