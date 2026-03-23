import { DOM, createCard, updateHero, enableDragScroll } from './ui.js?v=6';
import { fetchFromTMDB, discoverByCategory } from './api.js?v=5';
import { openPlayer, switchServer, cycleServer } from './player.js?v=14';
import { setupRouter, handleRoute, navigateTo } from './router.js?v=5';

setupRouter();

// Initial fetch for Home view
const [trendingMovies, trendingTv] = await Promise.all([
    fetchFromTMDB('/trending/movie/day'),
    fetchFromTMDB('/trending/tv/day')
]);

if(trendingMovies.length > 0) {
    updateHero(trendingMovies[0], openPlayer); 
    DOM.trendingMoviesGrid.innerHTML = '';
    trendingMovies.slice(1, 20).forEach(movie => {
        DOM.trendingMoviesGrid.appendChild(createCard(movie, 'movie', openPlayer));
    });
}

if(trendingTv.length > 0) {
    DOM.trendingTvGrid.innerHTML = '';
    trendingTv.slice(0, 20).forEach(tv => {
        DOM.trendingTvGrid.appendChild(createCard(tv, 'tv', openPlayer));
    });
}

// Inject Local Storage 'Continue Watching' row
const historyRaw = globalThis.localStorage.getItem('streamy_history');
if (historyRaw) {
    try {
        const historyList = JSON.parse(historyRaw);
        if (historyList.length > 0 && !document.getElementById('history-section')) {
            const historySection = document.createElement('section');
            historySection.className = 'content-section';
            historySection.id = 'history-section';
            historySection.innerHTML = `<h2 class="section-title">Continue Watching <i class="fa-solid fa-clock-rotate-left" style="font-size:0.8em; margin-left:10px; color:var(--text-secondary);"></i></h2><div class="grid-container" id="history-grid"></div>`;
            DOM.homeView.insertBefore(historySection, DOM.trendingMoviesSection);
            const historyGrid = document.getElementById('history-grid');
            historyList.slice(0, 20).forEach(item => {
                historyGrid.appendChild(createCard(item, null, openPlayer));
            });
            enableDragScroll(historyGrid);
        }
    } catch(e) { console.error("Error parsing history UI", e); }
}

enableDragScroll(DOM.trendingMoviesGrid);
enableDragScroll(DOM.trendingTvGrid);

// Initialize Catalogues & Infinite Scroll
let currentMovieGenre = 'trending';
let currentMoviePage = 1;
let currentTvGenre = 'trending';
let currentTvPage = 1;
let isFetchingMovie = false;
let isFetchingTv = false;

const infiniteObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            infiniteObserver.unobserve(entry.target);
            if (!DOM.moviesView.classList.contains('hidden')) {
                currentMoviePage++;
                loadCatalogue('movie', currentMovieGenre, DOM.moviesGrid, currentMoviePage);
            } else if (!DOM.tvView.classList.contains('hidden')) {
                currentTvPage++;
                loadCatalogue('tv', currentTvGenre, DOM.tvGrid, currentTvPage);
            }
        }
    });
}, { rootMargin: '600px' });

async function loadCatalogue(type, genreId, gridElement, page = 1) {
    if (type === 'movie' && isFetchingMovie) return;
    if (type === 'tv' && isFetchingTv) return;

    if (type === 'movie') isFetchingMovie = true;
    else if (type === 'tv') isFetchingTv = true;
    
    if (page === 1) gridElement.innerHTML = '';
    
    const results = await discoverByCategory(type, genreId, page);
    results.forEach(item => {
        gridElement.appendChild(createCard(item, type, openPlayer));
    });
    
    const lastCard = gridElement.lastElementChild;
    if (lastCard) infiniteObserver.observe(lastCard);
    
    if (type === 'movie') isFetchingMovie = false;
    else if (type === 'tv') isFetchingTv = false;
}

DOM.movieCategory.addEventListener('change', (e) => {
    currentMovieGenre = e.target.value;
    currentMoviePage = 1;
    loadCatalogue('movie', currentMovieGenre, DOM.moviesGrid, currentMoviePage);
});
DOM.tvCategory.addEventListener('change', (e) => {
    currentTvGenre = e.target.value;
    currentTvPage = 1;
    loadCatalogue('tv', currentTvGenre, DOM.tvGrid, currentTvPage);
});

// Initial load
loadCatalogue('movie', currentMovieGenre, DOM.moviesGrid, 1);
loadCatalogue('tv', currentTvGenre, DOM.tvGrid, 1);

// Setup Watchlist Render Engine
export function renderWatchlist() {
    if(!DOM.watchlistGrid) return;
    DOM.watchlistGrid.innerHTML = '';
    const list = JSON.parse(globalThis.localStorage.getItem('streamy_watchlist') || '[]');
    if(list.length === 0) {
        DOM.watchlistGrid.innerHTML = '<p style="color:var(--text-secondary); grid-column:1/-1;">Your list is empty. Hover over movies and click the + icon to add them.</p>';
        return;
    }
    list.forEach(item => {
        DOM.watchlistGrid.appendChild(createCard(item, item.media_type, openPlayer));
    });
}
globalThis.addEventListener('watchlist-updated', () => {
    if (globalThis.location.hash === '#watchlist') renderWatchlist();
});

// Force route evaluation once DOM and content is ready
handleRoute();

// Global Nav Listeners
DOM.navHome.addEventListener('click', (e) => { e.preventDefault(); navigateTo('#home'); });
if(DOM.navMovies) DOM.navMovies.addEventListener('click', (e) => { e.preventDefault(); navigateTo('#movies'); });
if(DOM.navTv) DOM.navTv.addEventListener('click', (e) => { e.preventDefault(); navigateTo('#tv'); });
if(DOM.navWatchlist) DOM.navWatchlist.addEventListener('click', (e) => { e.preventDefault(); navigateTo('#watchlist'); });
if(DOM.logoBtn) DOM.logoBtn.addEventListener('click', (e) => { e.preventDefault(); navigateTo('#home'); });
if(DOM.backBtn) DOM.backBtn.addEventListener('click', () => { globalThis.history.back(); });
if(DOM.tvServerBtn) DOM.tvServerBtn.addEventListener('click', cycleServer);

// Debounce Utility
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

async function handleSearch(query) {
    if(!query) return;

    if (!globalThis.location.hash.startsWith('#search')) {
        navigateTo(`#search?q=${encodeURIComponent(query)}`);
    } else {
        const newUrl = new URL(globalThis.location);
        newUrl.hash = `#search?q=${encodeURIComponent(query)}`;
        globalThis.history.replaceState(null, '', newUrl.toString());
    }

    DOM.searchResultsGrid.innerHTML = '<p>Searching...</p>';
    
    try {
        const results = await fetchFromTMDB(`/search/multi?query=${encodeURIComponent(query)}`);
        const filtered = results.filter(x => x.media_type === 'movie' || x.media_type === 'tv');

        DOM.searchResultsGrid.innerHTML = '';
        if(filtered.length === 0) {
            DOM.searchResultsGrid.innerHTML = '<p>No results found.</p>';
        } else {
            filtered.forEach(item => DOM.searchResultsGrid.appendChild(createCard(item, null, openPlayer)));
        }
    } catch(err) {
        DOM.searchResultsGrid.innerHTML = '<p>Error searching TMDB.</p>';
    }
}

const debouncedSearch = debounce((e) => {
    handleSearch(e.target.value.trim());
}, 500);

// Search Form
DOM.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSearch(DOM.searchInput.value.trim());
});

DOM.searchInput.addEventListener('input', debouncedSearch);

// Server buttons listener
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.server-btn');
    if (btn) {
        document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        switchServer(Number.parseInt(btn.dataset.server, 10));
    }
});
