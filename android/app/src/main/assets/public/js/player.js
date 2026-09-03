import { DOM, getSeriesProgress, saveSeriesProgress, toggleWatchlist, isInWatchlist, markPlaybackCompleted, clearPlaybackCompleted, isCompletedHistoryItem, normalizeItem } from './ui.js?v=116';
import { fetchTVEpisodeList, fetchTVSeasons, fetchFromTMDB, IMAGE_URL, getProxyHost, getDiscoveryLogs, buildBackendFetchOptions, discoverBackendHost, invalidateBackendHost } from './api.js?v=116';
import { navigateTo } from './router.js?v=116';

let currentMovieContext = null;
let webPlaybackSaveTimer = null;
let nearEndPromptDismissed = false;
let nearEndPromptShown = false;
let currentNextEpisodeTarget = null;
let currentPlaybackLinks = [];
let currentPlaybackSourceIndex = -1;
let currentPlaybackSeason = 1;
let currentPlaybackEpisode = 1;
let currentIntroMarker = null;
let browserFailoverTimer = null;
let extractionSessionId = 0;
let extractionAbortController = null;
let detailsSessionId = 0;
let episodeLoadId = 0;
let episodeFocusRequested = false;
const NEXT_EPISODE_PROMPT_THRESHOLD_MS = 120000;
const BROWSER_SOURCE_TIMEOUT_MS = 45000;
const EXTRACTION_REQUEST_TIMEOUT_MS = 25000;
const SOURCE_HEALTH_KEY = 'streamy_source_health_v1';
const PLAYBACK_DIAGNOSTICS_KEY = 'streamy_playback_diagnostics_v1';
const PLAYBACK_SETTINGS_KEY = 'streamy_playback_settings_v1';
let activeSourceFilter = 'all';
let nativeNextEpisodeRequestKey = '';

function cancelActiveExtraction() {
    extractionSessionId++;
    if (extractionAbortController) {
        extractionAbortController.abort();
        extractionAbortController = null;
    }
}

function getImdbId(movie = currentMovieContext) {
    return movie?.imdb_id || movie?.imdbId || movie?.external_ids?.imdb_id || '';
}

function normalizeIntroMarker(marker) {
    if (!marker || typeof marker !== 'object') return null;
    const startMs = Number(marker.startMs);
    const endMs = Number(marker.endMs);
    const confidence = Number(marker.confidence);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) {
        return null;
    }
    return {
        startMs: Math.round(startMs),
        endMs: Math.round(endMs),
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
        match: String(marker.match || 'reported'),
        provider: String(marker.provider || 'episode database'),
        adjusted: marker.adjusted === true
    };
}

function getPlaybackMetadataPayload() {
    return JSON.stringify({
        imdbId: getImdbId(currentMovieContext),
        season: currentPlaybackSeason,
        episode: currentPlaybackEpisode,
        introMarker: currentMovieContext?.type === 'tv' ? currentIntroMarker : null
    });
}

async function ensureExternalIds(movie = currentMovieContext, signal = null) {
    if (!movie?.id || getImdbId(movie)) return movie;

    try {
        const endpointType = movie.type === 'tv' ? 'tv' : 'movie';
        const externalIds = await fetchFromTMDB(`/${endpointType}/${movie.id}/external_ids`, { signal });
        if (externalIds?.imdb_id) {
            movie.imdb_id = externalIds.imdb_id;
        }
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        console.warn('[Sources] IMDb lookup failed:', error);
    }

    return movie;
}

function isActivationKey(event) {
    return event?.key === 'Enter'
        || event?.key === ' '
        || event?.key === 'Spacebar'
        || event?.key === 'OK'
        || event?.keyCode === 13
        || event?.keyCode === 23;
}

function getPlaybackMediaKey(movie = currentMovieContext, seasonOverride = null, episodeOverride = null) {
    if (!movie?.id) return '';
    const activeProfileRaw = globalThis.localStorage.getItem('streamy_active_profile') || 'default';
    if (movie.type === 'tv') {
        const progress = getSeriesProgress(movie.id);
        const seasonNumber = seasonOverride ?? progress.last_season ?? 1;
        const episodeNumber = episodeOverride ?? progress.last_episode ?? 1;
        return `${activeProfileRaw}:tv:${movie.id}:s${seasonNumber}:e${episodeNumber}`;
    }
    return `${activeProfileRaw}:${movie.type || 'movie'}:${movie.id}`;
}

function getPlaybackStoreKey() {
    const activeProfileRaw = globalThis.localStorage.getItem('streamy_active_profile') || 'default';
    return `streamy_playback_progress_${activeProfileRaw}`;
}

function getLocalPlaybackDb() {
    try {
        return JSON.parse(globalThis.localStorage.getItem(getPlaybackStoreKey()) || '{}');
    } catch (error) {
        return {};
    }
}

function saveLocalPlaybackProgress(movie, positionMs, durationMs = 0) {
    const mediaKey = getPlaybackMediaKey(movie);
    if (!mediaKey) return;
    const db = getLocalPlaybackDb();
    db[mediaKey] = {
        positionMs: Math.max(0, Math.round(positionMs || 0)),
        durationMs: Math.max(0, Math.round(durationMs || 0)),
        updatedAt: Date.now()
    };
    globalThis.localStorage.setItem(getPlaybackStoreKey(), JSON.stringify(db));
    clearPlaybackCompleted(movie);
}

function clearLocalPlaybackProgress(movie) {
    const mediaKey = getPlaybackMediaKey(movie);
    if (!mediaKey) return;
    const db = getLocalPlaybackDb();
    delete db[mediaKey];
    globalThis.localStorage.setItem(getPlaybackStoreKey(), JSON.stringify(db));
}

function getSavedPlaybackPositionMs(movie = currentMovieContext) {
    const mediaKey = getPlaybackMediaKey(movie);
    if (!mediaKey) return 0;

    if (globalThis.NativeBridge && typeof globalThis.NativeBridge.getPlaybackProgress === 'function') {
        const nativeValue = Number(globalThis.NativeBridge.getPlaybackProgress(mediaKey));
        if (Number.isFinite(nativeValue) && nativeValue > 0) {
            return nativeValue;
        }
    }

    const db = getLocalPlaybackDb();
    const storedValue = db[mediaKey];
    const localValue = typeof storedValue === 'object'
        ? Number(storedValue?.positionMs || 0)
        : Number(storedValue || 0);
    return Number.isFinite(localValue) ? localValue : 0;
}

function clearSavedPlaybackProgress(movie = currentMovieContext, completed = false) {
    clearLocalPlaybackProgress(movie);
    if (completed) {
        markPlaybackCompleted(movie);
    }
    const mediaKey = getPlaybackMediaKey(movie);
    if (mediaKey && globalThis.NativeBridge && typeof globalThis.NativeBridge.clearPlaybackProgress === 'function') {
        globalThis.NativeBridge.clearPlaybackProgress(mediaKey);
    }
}

function updateMoviePlayLabel() {
    if (!currentMovieContext || currentMovieContext.type === 'tv') return;
    const savedPositionMs = getSavedPlaybackPositionMs(currentMovieContext);
    if (savedPositionMs >= 30000) {
        const minutes = Math.max(1, Math.floor(savedPositionMs / 60000));
        DOM.playBtn.innerHTML = `<i class="fa-solid fa-play"></i> RESUME FROM ${minutes} MIN`;
    } else {
        DOM.playBtn.innerHTML = '<i class="fa-solid fa-play"></i> WATCH NOW';
    }
}

function syncWebPlaybackProgress(video) {
    if (!currentMovieContext) return;
    const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : 0;
    const positionMs = Math.max(0, Math.round(video.currentTime * 1000));

    if (durationMs > 0) {
        const remainingMs = durationMs - positionMs;
        if (positionMs < 30000) {
            clearSavedPlaybackProgress();
            return;
        }
        if (remainingMs <= 60000) {
            clearSavedPlaybackProgress(currentMovieContext, true);
            return;
        }
    } else if (positionMs < 30000) {
        return;
    }

    saveLocalPlaybackProgress(currentMovieContext, positionMs, durationMs);
}

function bindWebPlaybackProgress(video) {
    if (webPlaybackSaveTimer) {
        globalThis.clearInterval(webPlaybackSaveTimer);
        webPlaybackSaveTimer = null;
    }

    video.ontimeupdate = () => {
        maybeShowNextEpisodePrompt(video);
    };
    video.onpause = () => syncWebPlaybackProgress(video);
    video.onended = () => {
        const shouldAutoplay = currentMovieContext?.type === 'tv'
            && getPlaybackSettings().autoplayNextEpisode
            && !nearEndPromptDismissed;
        nearEndPromptShown = false;
        clearSavedPlaybackProgress(currentMovieContext, true);
        if (shouldAutoplay) {
            console.log("[Player] Video ended. Starting autoplay sequence...");
            showAutoplayCountdown();
        } else {
            DOM.autoplayOverlay.classList.add('hidden');
        }
    };

    webPlaybackSaveTimer = globalThis.setInterval(() => {
        if (!video.paused && !video.ended) {
            syncWebPlaybackProgress(video);
        }
    }, 10000);
}

async function maybeShowNextEpisodePrompt(video) {
    if (!currentMovieContext || currentMovieContext.type !== 'tv' || nearEndPromptDismissed || nearEndPromptShown) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;

    const remainingMs = Math.max(0, (video.duration - video.currentTime) * 1000);
    if (remainingMs > NEXT_EPISODE_PROMPT_THRESHOLD_MS) return;

    const nextTarget = await getNextEpisodeTarget();
    if (!nextTarget) return;

    currentNextEpisodeTarget = nextTarget;
    nearEndPromptShown = true;
    DOM.autoplayOverlay.classList.remove('hidden');
    DOM.autoplayCountdown.innerText = Math.max(1, Math.ceil(remainingMs / 1000));
    const autoplayLabel = getPlaybackSettings().autoplayNextEpisode ? ' | Auto-play at end' : '';
    DOM.autoplayNextTitle.innerText = `Up next: S${nextTarget.season} E${nextTarget.episode}${autoplayLabel}`;
    DOM.autoplaySkipBtn.onclick = () => {
        DOM.autoplayOverlay.classList.add('hidden');
        playNextEpisode();
    };
    DOM.autoplayCancelBtn.onclick = () => {
        nearEndPromptDismissed = true;
        DOM.autoplayOverlay.classList.add('hidden');
    };
    setTimeout(() => DOM.autoplaySkipBtn?.focus(), 100);
}

function getSeasonButtons() {
    return Array.from(DOM.seasonTabs?.querySelectorAll('.season-item-v2') || []);
}

function getEpisodeCards() {
    return Array.from(DOM.episodeList?.querySelectorAll('.episode-card-v2') || []);
}

function focusSeasonAt(index, activate = false) {
    const buttons = getSeasonButtons();
    if (!buttons.length) return;
    const safeIndex = Math.max(0, Math.min(index, buttons.length - 1));
    const button = buttons[safeIndex];
    button?.focus();
    if (activate && button && !button.classList.contains('active')) button.click();
}

function focusPreferredEpisode() {
    const preferred = DOM.episodeList?.querySelector('.episode-card-v2[data-resume="true"]')
        || DOM.episodeList?.querySelector('.episode-card-v2');
    if (preferred) {
        episodeFocusRequested = false;
        preferred.focus();
    } else {
        episodeFocusRequested = true;
    }
}

async function resolveNextEpisodeTarget(seasonNumber, episodeNumber, movie = currentMovieContext, signal = null) {
    try {
        const episodes = await fetchTVEpisodeList(movie.id, seasonNumber, { signal });
        const nextEpisode = episodes.find(ep => ep.episode_number === episodeNumber + 1);
        if (nextEpisode) {
            return { season: seasonNumber, episode: episodeNumber + 1, label: `NEXT EPISODE S${seasonNumber}:E${episodeNumber + 1}` };
        }

        const seasons = await fetchTVSeasons(movie.id, { signal });
        const nextSeason = seasons.find(season => season.season_number === seasonNumber + 1);
        if (nextSeason) {
            return { season: seasonNumber + 1, episode: 1, label: `NEXT EPISODE S${seasonNumber + 1}:E1` };
        }
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        console.warn('[TV] Unable to resolve next episode target:', error);
    }

    return null;
}

async function getNextEpisodeTarget() {
    if (!currentMovieContext || currentMovieContext.type !== 'tv') return null;

    const progress = getSeriesProgress(currentMovieContext.id);
    const seasonNumber = progress.last_season || 1;
    const episodeNumber = progress.last_episode || 1;
    return resolveNextEpisodeTarget(seasonNumber, episodeNumber);
}

async function updateNextEpisodeButton() {
    if (!DOM.nextEpisodeBtn) return;
    const requestMovie = currentMovieContext;

    if (!currentMovieContext || currentMovieContext.type !== 'tv') {
        DOM.nextEpisodeBtn.classList.add('hidden');
        return;
    }

    const nextTarget = await getNextEpisodeTarget();
    if (currentMovieContext !== requestMovie) return;
    if (!nextTarget) {
        DOM.nextEpisodeBtn.classList.add('hidden');
        return;
    }

    DOM.nextEpisodeBtn.classList.remove('hidden');
    DOM.nextEpisodeBtn.innerHTML = `<i class="fa-solid fa-forward-step"></i> ${nextTarget.label}`;
    DOM.nextEpisodeBtn.onclick = () => startScrapingSession(nextTarget.season, nextTarget.episode);
}

function refreshWatchlistButton(movie = currentMovieContext) {
    if (!DOM.watchlistBtn || !movie?.id) return;
    const exists = isInWatchlist(movie.id);
    if (exists) {
        DOM.watchlistBtn.innerHTML = '<i class="fa-solid fa-check"></i> ON WATCHLIST';
        DOM.watchlistBtn.classList.add('active');
        DOM.watchlistBtn.setAttribute('aria-pressed', 'true');
    } else {
        DOM.watchlistBtn.innerHTML = '<i class="fa-solid fa-plus"></i> WATCHLIST';
        DOM.watchlistBtn.classList.remove('active');
        DOM.watchlistBtn.setAttribute('aria-pressed', 'false');
    }
}

function bindWatchlistButton(movie = currentMovieContext) {
    if (!DOM.watchlistBtn || !movie?.id) return;
    refreshWatchlistButton(movie);

    const toggleCurrentWatchlist = event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        toggleWatchlist(movie, DOM.watchlistBtn);
        refreshWatchlistButton(movie);
    };

    DOM.watchlistBtn.onclick = toggleCurrentWatchlist;
    DOM.watchlistBtn.onkeydown = event => {
        if (isActivationKey(event)) {
            toggleCurrentWatchlist(event);
        }
    };
}

function refreshWatchedButton(movie = currentMovieContext) {
    if (!DOM.watchedBtn || !movie?.id) return;
    const watched = isCompletedHistoryItem(movie);
    if (watched) {
        DOM.watchedBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> CLEAR WATCHED';
        DOM.watchedBtn.classList.add('active');
        DOM.watchedBtn.setAttribute('aria-pressed', 'true');
    } else {
        DOM.watchedBtn.innerHTML = '<i class="fa-solid fa-eye"></i> MARK WATCHED';
        DOM.watchedBtn.classList.remove('active');
        DOM.watchedBtn.setAttribute('aria-pressed', 'false');
    }
}

function bindWatchedButton(movie = currentMovieContext) {
    if (!DOM.watchedBtn || !movie?.id) return;
    refreshWatchedButton(movie);

    const toggleWatched = event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (isCompletedHistoryItem(movie)) {
            clearPlaybackCompleted(movie);
        } else {
            clearSavedPlaybackProgress(movie, true);
        }
        refreshWatchedButton(movie);
        updateMoviePlayLabel();
    };

    DOM.watchedBtn.onclick = toggleWatched;
    DOM.watchedBtn.onkeydown = event => {
        if (isActivationKey(event)) {
            toggleWatched(event);
        }
    };
}

async function loadDetailsRecommendations(movie) {
    if (!DOM.detailsRecommendations || !DOM.detailsRecommendationRow || !movie?.id) return;
    const requestKey = `${movie.type}:${movie.id}`;
    DOM.detailsRecommendations.classList.add('hidden');
    DOM.detailsRecommendationRow.innerHTML = '';

    try {
        const results = await fetchFromTMDB(`/${movie.type}/${movie.id}/recommendations?page=1`);
        if (!currentMovieContext || `${currentMovieContext.type}:${currentMovieContext.id}` !== requestKey) return;

        const cards = (Array.isArray(results) ? results : [])
            .map(item => normalizeItem({ ...item, media_type: movie.type }, movie.type))
            .filter(item => item.poster && String(item.id) !== String(movie.id))
            .slice(0, 14);

        if (!cards.length) return;

        DOM.detailsRecommendations.classList.remove('hidden');
        cards.forEach(item => {
            const card = document.createElement('div');
            card.className = 'poster-card details-rec-card';
            card.tabIndex = 0;
            card.innerHTML = `
                <img loading="lazy" src="${item.poster}" alt="${item.title}" draggable="false">
                <div class="details-rec-title">${item.title}</div>
            `;
            card.onclick = () => openDetails(item);
            card.onkeydown = event => {
                if (isActivationKey(event)) {
                    card.click();
                    event.preventDefault();
                }
            };
            DOM.detailsRecommendationRow.appendChild(card);
        });
    } catch (error) {
        console.warn('[Details] Failed to load recommendations:', error);
    }
}

function setupTvDetailNavigation() {
    const focusSeasonList = () => {
        const activeSeason = DOM.seasonTabs?.querySelector('.season-item-v2.active');
        if (activeSeason) activeSeason.focus();
        else focusSeasonAt(0);
    };

    const allActionButtons = [DOM.playBtn, DOM.nextEpisodeBtn, DOM.watchlistBtn, DOM.watchedBtn].filter(Boolean);

    allActionButtons.forEach(btn => {
        if (!btn) return;
        btn.onkeydown = e => {
            if (isActivationKey(e)) {
                btn.click();
                e.preventDefault();
                return;
            }
            if (currentMovieContext?.type === 'tv' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                const actionButtons = allActionButtons.filter(actionButton => !actionButton.classList.contains('hidden'));
                const index = actionButtons.indexOf(btn);
                const delta = e.key === 'ArrowRight' ? 1 : -1;
                const peer = actionButtons[index + delta];
                if (peer) peer.focus();
                e.preventDefault();
            }
            if (currentMovieContext?.type === 'tv' && e.key === 'ArrowDown') {
                focusSeasonList();
                e.preventDefault();
            }
        };
    });

    if (DOM.seasonTabs) DOM.seasonTabs.dataset.navScope = 'tv-details';
    if (DOM.episodeList) DOM.episodeList.dataset.navScope = 'tv-details';
    if (DOM.playBtn) DOM.playBtn.dataset.navScope = currentMovieContext?.type === 'tv' ? 'tv-details' : '';
    if (DOM.nextEpisodeBtn) DOM.nextEpisodeBtn.dataset.navScope = currentMovieContext?.type === 'tv' ? 'tv-details' : '';
    if (DOM.watchlistBtn) DOM.watchlistBtn.dataset.navScope = currentMovieContext?.type === 'tv' ? 'tv-details' : '';
    if (DOM.watchedBtn) DOM.watchedBtn.dataset.navScope = currentMovieContext?.type === 'tv' ? 'tv-details' : '';
}

// Extractor Endpoint (Dynamic Discovery v77)
function getExtractionApi() {
    return getProxyHost();
}

const UPDATE_SERVER = 'https://streamy-vez5.onrender.com';

function readJsonObject(key) {
    try {
        const parsed = JSON.parse(globalThis.localStorage.getItem(key) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

function writeJsonObject(key, value) {
    globalThis.localStorage.setItem(key, JSON.stringify(value || {}));
}

export function getPlaybackSettings() {
    const stored = readJsonObject(PLAYBACK_SETTINGS_KEY);
    const backupSourcesOptedIn = stored.includeBackupSources === true
        && Number(stored.backupSourcesOptInVersion || 0) >= 102;
    return {
        sourcePreference: stored.sourcePreference || 'extractor',
        autoplaySources: stored.autoplaySources !== false,
        autoplayNextEpisode: stored.autoplayNextEpisode !== false,
        includeBackupSources: backupSourcesOptedIn,
        directSourceEndpoint: String(stored.directSourceEndpoint || stored.directSourceEndpoints || '')
    };
}

export function savePlaybackSettings(nextSettings = {}) {
    const current = getPlaybackSettings();
    const merged = {
        ...current,
        ...nextSettings,
        sourcePreference: nextSettings.sourcePreference || current.sourcePreference || 'extractor',
        autoplaySources: typeof nextSettings.autoplaySources === 'boolean'
            ? nextSettings.autoplaySources
            : current.autoplaySources,
        autoplayNextEpisode: typeof nextSettings.autoplayNextEpisode === 'boolean'
            ? nextSettings.autoplayNextEpisode
            : current.autoplayNextEpisode,
        includeBackupSources: typeof nextSettings.includeBackupSources === 'boolean'
            ? nextSettings.includeBackupSources
            : current.includeBackupSources,
        directSourceEndpoint: typeof nextSettings.directSourceEndpoint === 'string'
            ? nextSettings.directSourceEndpoint.trim()
            : current.directSourceEndpoint,
        backupSourcesOptInVersion: typeof nextSettings.includeBackupSources === 'boolean'
            ? 102
            : Number(current.backupSourcesOptInVersion || 0)
    };
    writeJsonObject(PLAYBACK_SETTINGS_KEY, merged);
    return merged;
}

export function resetSourceHealth() {
    globalThis.localStorage.removeItem(SOURCE_HEALTH_KEY);
    globalThis.dispatchEvent(new Event('streamy-playback-diagnostics-updated'));
}

function getSourceKey(link) {
    const server = (link?.server || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const host = (() => {
        try {
            return new URL(link?.url || '').hostname.toLowerCase();
        } catch (error) {
            return '';
        }
    })();
    return server || host || 'unknown-source';
}

function getSourceHealth(link) {
    const db = readJsonObject(SOURCE_HEALTH_KEY);
    return db[getSourceKey(link)] || { failures: 0, successes: 0, lastStatus: 'unknown', lastReason: '' };
}

function isVidlinkSource(link) {
    const source = `${link?.server || ''} ${link?.url || ''}`.toLowerCase();
    return source.includes('vidlink');
}

function isTrustedEmbedSource(link) {
    const source = `${link?.server || ''} ${link?.url || ''}`.toLowerCase();
    return [
        'vidlink',
        'videasy',
        'autoembed',
        'vidrock',
        'vsembed',
        'cinemaos',
        'vidsrcn'
    ].some(name => source.includes(name));
}

function filterLinksForPlaybackSettings(links = []) {
    const settings = getPlaybackSettings();
    if (settings.sourcePreference === 'vidlink') {
        return links.filter(isVidlinkSource);
    }
    if (!settings.includeBackupSources) {
        return links.filter(link => link?.type !== 'iframe' || isTrustedEmbedSource(link));
    }
    return links;
}

function parseDirectSourceEndpoints(value = '') {
    return String(value || '')
        .split(/[\n,]+/)
        .map(endpoint => endpoint.trim())
        .filter(Boolean);
}

function getProviderNameFromEndpoint(endpoint) {
    try {
        return new URL(endpoint).hostname.replace(/^www\./, '');
    } catch (error) {
        return 'Configured Direct';
    }
}

function inferDirectStreamType(url, rawType = '') {
    const lowerUrl = String(url || '').toLowerCase();
    const lowerType = String(rawType || '').toLowerCase();
    if (lowerType.includes('iframe') || lowerType.includes('embed')) return 'iframe';
    if (lowerType.includes('hls') || lowerType.includes('mpegurl') || lowerUrl.includes('.m3u8')) return 'hls';
    if (lowerType.includes('mp4') || lowerUrl.includes('.mp4')) return 'mp4';
    if (lowerType.includes('mkv') || lowerUrl.includes('.mkv')) return 'mp4';
    return lowerUrl.startsWith('http') ? 'mp4' : null;
}

function firstPresentString(source, keys = []) {
    if (!source || typeof source !== 'object') return '';
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function normalizeDirectProviderLink(rawLink, providerName = 'Direct Provider') {
    if (!rawLink) return null;
    const link = typeof rawLink === 'string' ? { url: rawLink } : rawLink;
    const url = firstPresentString(link, [
        'url',
        'href',
        'file',
        'src',
        'stream',
        'streamUrl',
        'stream_url',
        'playlist',
        'playlistUrl',
        'playlist_url',
        'hls',
        'hlsUrl',
        'hls_url',
        'mp4',
        'download'
    ]);
    if (!url || typeof url !== 'string') return null;

    const headers = link.headers || link.requestHeaders || link.request_headers || {};
    const rawType = link.type || link.mimeType || link.mime || link.format || '';
    const type = inferDirectStreamType(url, rawType);
    if (!type || type === 'iframe') return null;

    return {
        server: link.server || link.provider || link.host || link.name || providerName,
        url,
        type,
        quality: link.quality || link.label || link.resolution || (link.height ? `${link.height}p` : ''),
        referer: link.referer || link.referrer || headers.Referer || headers.referer || '',
        origin: link.origin || headers.Origin || headers.origin || '',
        cookie: link.cookie || headers.Cookie || headers.cookie || '',
        providerTier: 'configured',
        direct: true
    };
}

function normalizeDirectProviderPayload(payload, providerName = 'Direct Provider') {
    const links = [];
    const seen = new Set();

    const addLink = (raw, inheritedProvider = providerName, depth = 0) => {
        if (!raw || depth > 5) return;

        if (typeof raw === 'string') {
            const direct = normalizeDirectProviderLink(raw, inheritedProvider);
            if (direct && !seen.has(direct.url)) {
                seen.add(direct.url);
                links.push(direct);
            }
            return;
        }

        if (Array.isArray(raw)) {
            raw.forEach(item => addLink(item, inheritedProvider, depth + 1));
            return;
        }

        if (typeof raw !== 'object') return;

        const localProvider = raw.provider || raw.server || raw.host || raw.name || inheritedProvider;
        const direct = normalizeDirectProviderLink(raw, localProvider);
        if (direct && !seen.has(direct.url)) {
            seen.add(direct.url);
            links.push(direct);
        }

        if (raw.qualities && typeof raw.qualities === 'object') {
            Object.entries(raw.qualities).forEach(([quality, value]) => {
                const qualityLink = typeof value === 'string' ? { url: value, quality } : { ...value, quality: value?.quality || quality };
                addLink(qualityLink, localProvider, depth + 1);
            });
        }

        ['links', 'streams', 'sources', 'items', 'results', 'data', 'result', 'payload'].forEach(key => {
            if (raw[key]) addLink(raw[key], localProvider, depth + 1);
        });
    };

    addLink(payload, providerName);
    return links;
}

function buildDirectProviderUrl(template, { season, episode, movie = currentMovieContext }) {
    const replacements = {
        tmdb: movie?.id || '',
        imdb: getImdbId(movie),
        type: movie?.type || 'movie',
        title: encodeURIComponent(movie?.title || ''),
        year: movie?.year || '',
        season: season || '',
        episode: episode || ''
    };

    return Object.entries(replacements).reduce(
        (url, [key, value]) => url.replaceAll(`{${key}}`, String(value)),
        template
    );
}

async function fetchConfiguredDirectLinks(season = 1, episode = 1, movie = currentMovieContext, signal = null) {
    const endpointTemplates = parseDirectSourceEndpoints(getPlaybackSettings().directSourceEndpoint);
    if (!endpointTemplates.length) return [];

    const allLinks = [];
    for (const endpointTemplate of endpointTemplates) {
        if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
        const endpoint = buildDirectProviderUrl(endpointTemplate, { season, episode, movie });
        try {
            const res = await fetch(endpoint, buildBackendFetchOptions(endpoint, { method: 'GET', cache: 'no-cache', signal }));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const contentType = res.headers.get('content-type') || '';
            const payload = contentType.includes('application/json')
                ? await res.json()
                : await res.text();
            const providerName = typeof payload === 'object' && payload?.provider
                ? payload.provider
                : getProviderNameFromEndpoint(endpoint);
            const links = typeof payload === 'string'
                ? normalizeDirectProviderPayload(payload.split(/\r?\n/).filter(Boolean), providerName)
                : normalizeDirectProviderPayload(payload, providerName);
            allLinks.push(...links);
        } catch (error) {
            if (error?.name === 'AbortError') throw error;
            console.warn('[DirectProvider] Configured provider failed:', error);
            recordPlaybackDiagnostic({
                status: 'direct-provider-failed',
                reason: `${getProviderNameFromEndpoint(endpoint)}: ${error.message || 'Configured direct provider failed'}`,
                nativeMediaStatus: 'direct-provider'
            });
        }
    }

    const dedupedLinks = mergeStreamLinks(allLinks, []);
    if (dedupedLinks.length) {
        recordPlaybackDiagnostic({
            status: 'direct-provider-ready',
            reason: `Configured direct providers returned ${dedupedLinks.length} links`,
            nativeMediaStatus: 'direct-provider'
        });
    }
    return dedupedLinks;
}

function markSourceResult(link, status, reason = '') {
    if (!link) return;
    const key = getSourceKey(link);
    const db = readJsonObject(SOURCE_HEALTH_KEY);
    const current = db[key] || { failures: 0, successes: 0 };

    db[key] = {
        ...current,
        failures: status === 'failed' ? Number(current.failures || 0) + 1 : Math.max(0, Number(current.failures || 0) - 1),
        successes: status === 'success' ? Number(current.successes || 0) + 1 : Number(current.successes || 0),
        lastStatus: status,
        lastReason: reason,
        lastUpdatedAt: Date.now(),
        server: link.server || key
    };
    writeJsonObject(SOURCE_HEALTH_KEY, db);
}

function recordPlaybackDiagnostic(update = {}) {
    const previous = readJsonObject(PLAYBACK_DIAGNOSTICS_KEY);
    const link = update.link || currentPlaybackLinks[currentPlaybackSourceIndex] || null;
    const payload = {
        ...previous,
        ...update,
        updatedAt: new Date().toISOString(),
        title: currentMovieContext?.title || previous.title || '',
        mediaType: currentMovieContext?.type || previous.mediaType || '',
        tmdbId: currentMovieContext?.id || previous.tmdbId || '',
        sourceIndex: currentPlaybackSourceIndex,
        sourceCount: currentPlaybackLinks.length,
        sourceServer: link?.server || update.sourceServer || previous.sourceServer || '',
        sourceType: link?.type || update.sourceType || previous.sourceType || '',
        sourceUrl: link?.url || update.sourceUrl || previous.sourceUrl || '',
        backendHost: getProxyHost()
    };
    delete payload.link;
    writeJsonObject(PLAYBACK_DIAGNOSTICS_KEY, payload);
    globalThis.dispatchEvent(new Event('streamy-playback-diagnostics-updated'));
    return payload;
}

function getSourceScore(link) {
    const settings = getPlaybackSettings();
    const health = getSourceHealth(link);
    let baseScore = link?.type !== 'iframe' ? -20 : getIframeHostPriority(link);
    if (isNamedDirectProvider(link)) baseScore -= 18;

    if (settings.sourcePreference === 'extractor') {
        if (link?.type !== 'iframe') {
            baseScore -= 35;
        } else if (isVidlinkSource(link)) {
            baseScore -= 16;
        } else if (isTrustedEmbedSource(link)) {
            baseScore -= 8;
        } else {
            baseScore += 10;
        }
    } else if (settings.sourcePreference === 'direct') {
        baseScore += link?.type !== 'iframe' ? -25 : 10;
    } else if (settings.sourcePreference === 'browser') {
        baseScore += link?.type === 'iframe' ? -25 : 18;
    } else if (settings.sourcePreference === 'vidlink') {
        baseScore += isVidlinkSource(link) ? -40 : 30;
    }

    const failureMultiplier = settings.sourcePreference === 'stable' ? 8 : 3;
    const recentFailurePenalty = health.lastStatus === 'failed' ? Math.min(30, Number(health.failures || 0) * failureMultiplier) : 0;
    const successBonus = Math.min(settings.sourcePreference === 'stable' ? 12 : 3, Number(health.successes || 0) * (settings.sourcePreference === 'stable' ? 3 : 1));
    return baseScore + recentFailurePenalty - successBonus;
}

function getSourceBadge(link, isPreferred = false) {
    const source = `${link?.server || ''} ${link?.url || ''}`.toLowerCase();
    const health = getSourceHealth(link);
    let label = 'Backup';
    let tone = 'backup';

    const namedProviderLabel = getNamedDirectProviderLabel(link);
    if (namedProviderLabel) {
        label = namedProviderLabel;
        tone = 'recommended';
    } else if (link?.providerTier === 'configured') {
        label = 'Direct Provider';
        tone = 'recommended';
    } else if (link?.type !== 'iframe') {
        label = 'Recommended Direct';
        tone = 'recommended';
    } else if (source.includes('vidlink')) {
        label = 'Recommended';
        tone = 'recommended';
    } else if (source.includes('vidsrc')) {
        label = 'Extraction Candidate';
        tone = 'backup';
    } else if (link?.type === 'iframe') {
        label = 'Extraction Candidate';
        tone = 'backup';
    }

    if (source.includes('ad') || source.includes('popup')) {
        label = 'Ad-Prone Backup';
        tone = 'unstable';
    }

    if (health.lastStatus === 'failed') {
        label = 'Recently Failed';
        tone = 'unstable';
    }

    const auto = isPreferred ? '<span class="source-badge source-badge-auto">Auto</span>' : '';
    return `${auto}<span class="source-badge source-badge-${tone}">${label}</span>`;
}

function getNamedDirectProviderLabel(link) {
    const tier = String(link?.providerTier || '').toLowerCase();
    const labels = {
        sfx: 'SFX Direct',
        streamex: 'StreameX Direct',
        cinemaos: 'CinemaOS Direct',
        vid2: 'Vid2 Direct',
        videasy: 'Videasy Direct',
        vidpro: 'VidPro Direct',
        'bee-compat': 'Bee-Compatible',
        stremio: 'Stremio Direct'
    };
    return labels[tier] || '';
}

function isNamedDirectProvider(link) {
    return !!getNamedDirectProviderLabel(link) || link?.providerTier === 'configured';
}

function getSourceQualityLabel(link) {
    const source = `${link?.server || ''} ${link?.url || ''}`.toLowerCase();
    if (link?.quality) return link.quality;
    if (source.includes('2160') || source.includes('4k')) return '4K';
    if (source.includes('1080')) return '1080p';
    if (source.includes('720')) return '720p';
    if (source.includes('480')) return '480p';
    return link?.type === 'iframe' ? 'Auto Quality' : 'Direct';
}

function getSourceHostLabel(link) {
    try {
        return new URL(link?.url || '').hostname.replace(/^www\./, '');
    } catch (error) {
        return 'unknown host';
    }
}

function sourceMatchesActiveFilter(link) {
    if (activeSourceFilter === 'vidlink') return isVidlinkSource(link);
    if (activeSourceFilter === 'direct') return link?.type !== 'iframe';
    if (activeSourceFilter === 'browser') return link?.type === 'iframe';
    if (activeSourceFilter === 'healthy') return getSourceHealth(link).lastStatus !== 'failed';
    return true;
}

function renderSourceFilters(preferredBestLink) {
    if (!DOM.sourceFilterControls) return;
    const filters = [
        { id: 'all', label: 'All Sources', icon: 'fa-layer-group' },
        { id: 'healthy', label: 'Working History', icon: 'fa-heart-pulse' },
        { id: 'direct', label: 'Direct Play', icon: 'fa-bolt' },
        { id: 'vidlink', label: 'Vidlink', icon: 'fa-shield-halved' },
        { id: 'browser', label: 'Web Players', icon: 'fa-window-restore' }
    ];

    DOM.sourceFilterControls.classList.remove('hidden');
    DOM.sourceFilterControls.innerHTML = filters.map(filter => `
        <button class="source-filter-btn ${activeSourceFilter === filter.id ? 'active' : ''}" data-source-filter="${filter.id}" tabindex="0">
            <i class="fa-solid ${filter.icon}"></i> ${filter.label}
        </button>
    `).join('');

    DOM.sourceFilterControls.querySelectorAll('.source-filter-btn').forEach(button => {
        button.onclick = () => {
            activeSourceFilter = button.dataset.sourceFilter || 'all';
            renderSourceList(preferredBestLink);
        };
        button.onkeydown = event => {
            if (isActivationKey(event)) {
                button.click();
                event.preventDefault();
            }
        };
    });
}

function renderSourceList(preferredBestLink = null) {
    DOM.serverList.innerHTML = '';
    renderSourceFilters(preferredBestLink);

    const visibleLinks = currentPlaybackLinks
        .map((link, index) => ({ link, index }))
        .filter(({ link }) => sourceMatchesActiveFilter(link));

    if (!visibleLinks.length) {
        DOM.serverList.innerHTML = '<li class="empty-source-list">No sources match this filter.</li>';
        return;
    }

    visibleLinks.forEach(({ link, index }) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = `server-btn ${link?.type !== 'iframe' ? 'server-btn-direct' : 'server-btn-browser'}`;
        btn.tabIndex = 0;
        const isPreferred = link === preferredBestLink;
        const health = getSourceHealth(link);
        const lastStatus = health.lastStatus && health.lastStatus !== 'unknown'
            ? `${health.lastStatus}${health.lastReason ? `: ${health.lastReason}` : ''}`
            : 'No history yet';

        btn.innerHTML = `
            <div class="source-rank">${String(index + 1).padStart(2, '0')}</div>
            <div class="source-card-body">
                <div class="source-card-title">
                    <b>${link.server || 'Unknown Source'}</b>
                    ${getSourceBadge(link, isPreferred)}
                </div>
                <div class="source-meta-row">
                    <span>${getSourceQualityLabel(link)}</span>
                    <span>${(link.type || 'iframe').toUpperCase()}</span>
                    <span>${getSourceHostLabel(link)}</span>
                    <span>${isPreferred ? 'Auto-play source' : 'Manual backup'}</span>
                </div>
                <div class="source-health-note">${lastStatus}</div>
            </div>
            <div class="source-action">
                <i class="fa-solid fa-circle-play"></i>
                <span>Play</span>
            </div>
        `;

        btn.onclick = () => {
            playSourceAt(index, 'manual-source-select');
        };
        btn.onkeydown = (ev) => {
            if (isActivationKey(ev)) {
                btn.click();
                ev.preventDefault();
            }
        };

        li.appendChild(btn);
        DOM.serverList.appendChild(li);

        if (isPreferred) {
            btn.classList.add('preferred');
        }
    });
}

function getPlayableSourcePayload() {
    return JSON.stringify(currentPlaybackLinks.map(link => ({
        server: link.server || 'Unknown',
        type: link.type || 'iframe',
        url: link.url || '',
        referer: link.referer || '',
        origin: link.origin || '',
        cookie: link.cookie || '',
        quality: link.quality || ''
    })));
}

function sortStreamLinks(links) {
    return [...(links || [])].sort((a, b) => getSourceScore(a) - getSourceScore(b));
}

export function getPlaybackDiagnosticsText() {
    const diag = readJsonObject(PLAYBACK_DIAGNOSTICS_KEY);
    const health = readJsonObject(SOURCE_HEALTH_KEY);
    const healthLines = Object.values(health)
        .sort((a, b) => Number(b.lastUpdatedAt || 0) - Number(a.lastUpdatedAt || 0))
        .slice(0, 6)
        .map(item => `- ${item.server || 'source'}: ${item.lastStatus || 'unknown'} (${item.lastReason || 'no reason'})`);

    return [
        `Updated: ${diag.updatedAt || 'never'}`,
        `Title: ${diag.title || 'none'}`,
        `Media: ${diag.mediaType || 'unknown'} ${diag.tmdbId ? `#${diag.tmdbId}` : ''}`,
        `Backend: ${diag.backendHost || getProxyHost()}`,
        `Source: ${diag.sourceServer || 'none'} (${diag.sourceType || 'unknown'})`,
        `Source Position: ${Number(diag.sourceIndex || 0) + 1 || 0}/${diag.sourceCount || 0}`,
        `Status: ${diag.status || 'idle'}`,
        `Reason: ${diag.reason || 'none'}`,
        `Native Media: ${diag.nativeMediaStatus || 'waiting/not reported'}`,
        `URL: ${diag.sourceUrl || 'none'}`,
        '',
        'Recent Source Health:',
        ...(healthLines.length ? healthLines : ['- No source health data yet']),
        '',
        'Backend Discovery:',
        getDiscoveryLogs() || 'No discovery logs yet'
    ].join('\n');
}

export function copyPlaybackDiagnostics() {
    const text = getPlaybackDiagnosticsText();
    if (globalThis.navigator?.clipboard?.writeText) {
        return globalThis.navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('Clipboard API unavailable'));
}

function getIframeHostPriority(link) {
    const url = (link?.url || '').toLowerCase();
    const server = (link?.server || '').toLowerCase();
    const source = `${server} ${url}`;
    if (source.includes('vidlink')) return 0;
    if (source.includes('vidbinge')) return 1;
    if (source.includes('vidsrc.me')) return 2;
    if (source.includes('vidsrc.net')) return 3;
    if (source.includes('multiembed')) return 4;
    return 5;
}

function choosePreferredLink(links = []) {
    if (!Array.isArray(links) || links.length === 0) return null;
    const sorted = sortStreamLinks(links);
    const directLink = sorted.find(link => link.type !== 'iframe');
    if (directLink) return directLink;

    return sorted[0] || links[0];
}

function getFallbackStreamLinks(movie, season = 1, episode = 1) {
    if (!movie?.id) return [];

    const tmdbId = movie.id;
    const imdbId = getImdbId(movie);
    const isTv = movie.type === 'tv';
    return [
        {
            server: 'Vidlink',
            url: isTv
                ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}?primaryColor=6366f1&secondaryColor=a5b4fc&iconColor=ffffff&icons=fontawesome&player=v2&autoplay=true&volume=1.0&muted=0`
                : `https://vidlink.pro/movie/${tmdbId}?primaryColor=6366f1&secondaryColor=a5b4fc&iconColor=ffffff&icons=fontawesome&player=v2&autoplay=true&volume=1.0&muted=0`,
            type: 'iframe',
            providerTier: 'vidlink'
        },
        {
            server: 'Videasy',
            url: isTv
                ? `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}?autoplay=true`
                : `https://player.videasy.net/movie/${tmdbId}?autoplay=true`,
            type: 'iframe',
            providerTier: 'bee-compat'
        },
        {
            server: 'AutoEmbed',
            url: isTv
                ? `https://autoembed.pro/embed/tv/${tmdbId}/${season}/${episode}`
                : `https://autoembed.pro/embed/movie/${imdbId || tmdbId}`,
            type: 'iframe',
            providerTier: 'bee-compat'
        },
        {
            server: 'VidRock',
            url: isTv
                ? `https://vidrock.net/tv/${tmdbId}/${season}/${episode}`
                : `https://vidrock.net/movie/${tmdbId}`,
            type: 'iframe',
            providerTier: 'bee-compat'
        },
        {
            server: 'VSEmbed',
            url: isTv
                ? `https://vsembed.ru/embed/tv/${imdbId || tmdbId}/${season}/${episode}`
                : `https://vsembed.ru/embed/movie/${imdbId || tmdbId}`,
            type: 'iframe',
            providerTier: 'bee-compat'
        },
        {
            server: 'MultiEmbed',
            url: isTv
                ? `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`
                : `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1`,
            type: 'iframe'
        },
        {
            server: 'VidBinge',
            url: isTv
                ? `https://vidbinge.dev/embed/tv/${tmdbId}/${season}/${episode}`
                : `https://vidbinge.dev/embed/movie/${tmdbId}`,
            type: 'iframe'
        },
        {
            server: 'Vidsrc.me',
            url: isTv
                ? `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
                : `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`,
            type: 'iframe'
        },
        {
            server: 'Vidsrc.net',
            url: isTv
                ? `https://vidsrc.net/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
                : `https://vidsrc.net/embed/movie?tmdb=${tmdbId}`,
            type: 'iframe'
        }
    ];
}

function mergeStreamLinks(primaryLinks, fallbackLinks) {
    const seen = new Set();
    const merged = [];

    [...(primaryLinks || []), ...(fallbackLinks || [])].forEach(link => {
        if (!link?.url) return;
        const key = link.url.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(link);
    });

    return merged;
}

function clearBrowserFailoverTimer() {
    if (browserFailoverTimer) {
        globalThis.clearTimeout(browserFailoverTimer);
        browserFailoverTimer = null;
    }
}

function startBrowserFailoverTimer(link, index) {
    clearBrowserFailoverTimer();
    const settings = getPlaybackSettings();
    const shouldAutoFailover = link?.type !== 'iframe' || settings.includeBackupSources;
    if (!shouldAutoFailover || isVidlinkSource(link)) {
        recordPlaybackDiagnostic({
            status: 'browser-source-opened',
            reason: 'Strict source mode is keeping this source open instead of jumping to unreliable backups',
            nativeMediaStatus: 'waiting',
            link
        });
        return;
    }

    browserFailoverTimer = globalThis.setTimeout(() => {
        const iframe = document.getElementById('fallback-iframe');
        const videoIsPlaying = DOM.videoPlayer && !DOM.videoPlayer.paused && DOM.videoPlayer.currentTime > 0;
        if (!iframe || iframe.style.display === 'none' || videoIsPlaying) return;
        markSourceResult(link, 'failed', 'Browser iframe timed out');
        recordPlaybackDiagnostic({
            status: 'source-timeout',
            reason: 'Browser iframe did not expose playable media in time',
            nativeMediaStatus: 'timeout',
            link
        });
        playNextSource('browser-timeout');
    }, BROWSER_SOURCE_TIMEOUT_MS);
}

function playSourceAt(index, reason = 'manual') {
    if (!currentPlaybackLinks.length) return false;
    if (index < 0 || index >= currentPlaybackLinks.length) return false;

    const link = currentPlaybackLinks[index];
    currentPlaybackSourceIndex = index;
    recordPlaybackDiagnostic({
        status: 'opening-source',
        reason,
        nativeMediaStatus: 'waiting',
        link
    });

    if (link.type === 'iframe') {
        playIframeFallback(link.url, link, index);
    } else {
        playNativeVideo(link.url, link, index);
    }
    return true;
}

function playNextSource(reason = 'manual-next') {
    const failedLink = currentPlaybackLinks[currentPlaybackSourceIndex];
    if (failedLink) markSourceResult(failedLink, 'failed', reason);

    const nextIndex = currentPlaybackSourceIndex + 1;
    if (playSourceAt(nextIndex, reason)) return true;

    clearBrowserFailoverTimer();
    recordPlaybackDiagnostic({
        status: 'all-sources-exhausted',
        reason,
        nativeMediaStatus: 'failed'
    });
    DOM.scraperStatus.classList.remove('hidden');
    DOM.scraperStatus.innerHTML = '<div style="color:var(--primary);"><i class="fa-solid fa-triangle-exclamation"></i> All sources failed. Try again later or select a source manually.</div>';
    navigateTo('#links');
    setTimeout(() => DOM.serverList?.querySelector('.server-btn')?.focus(), 150);
    return false;
}

function reloadCurrentSource() {
    if (currentPlaybackSourceIndex < 0) return;
    const link = currentPlaybackLinks[currentPlaybackSourceIndex];
    recordPlaybackDiagnostic({
        status: 'reloading-source',
        reason: 'manual-reload',
        link
    });
    playSourceAt(currentPlaybackSourceIndex, 'manual-reload');
}

export async function openDetails(movie) {
    cancelActiveExtraction();
    const requestId = ++detailsSessionId;
    episodeLoadId++;
    episodeFocusRequested = false;
    currentMovieContext = movie;
    DOM.detTitle.textContent = movie.title;
    DOM.detMeta.textContent = `${movie.year} | ${movie.type.toUpperCase()} | ${movie.rating}`;
    DOM.detDesc.textContent = movie.desc;
    DOM.detPoster.src = movie.poster;
    if (movie.backdrop && movie.backdrop !== 'none') DOM.detBackdrop.style.backgroundImage = `url('${movie.backdrop}')`;
    else DOM.detBackdrop.style.backgroundImage = 'none';

    if (movie.type === 'tv') {
        DOM.tvControls.classList.remove('hidden');
        DOM.seasonTabs.innerHTML = '<div style="color:#aaa; padding:20px;">Loading Seasons...</div>';
        DOM.episodeList.innerHTML = '';
        DOM.playBtn.innerHTML = '<i class="fa-solid fa-play"></i> RESUME LATEST';
        updateNextEpisodeButton();

        bindWatchlistButton(movie);
        bindWatchedButton(movie);
        loadDetailsRecommendations(movie);
        DOM.playBtn.onclick = () => startScrapingSession(null, null);
        setupTvDetailNavigation();
        navigateTo('#details');
        setTimeout(() => DOM.playBtn.focus(), 150);

        const seasons = await fetchTVSeasons(movie.id);
        if (requestId !== detailsSessionId || currentMovieContext !== movie) return;
        if (seasons && seasons.length > 0) {
            DOM.seasonTabs.innerHTML = '';
            const progress = getSeriesProgress(movie.id);
            let targetSeasonNumber = progress.last_season || 1;

            let valid = seasons.find(s => s.season_number === targetSeasonNumber);
            if (!valid) targetSeasonNumber = seasons[0].season_number;

            seasons.forEach(s => {
                if (s.season_number > 0) {
                    const btn = document.createElement('button');
                    btn.className = 'season-item-v2';
                    btn.tabIndex = 0;
                    if (s.season_number === targetSeasonNumber) btn.classList.add('active');
                    btn.innerHTML = `Season ${s.season_number}`;

                    btn.onclick = () => {
                        Array.from(DOM.seasonTabs.children).forEach(c => c.classList.remove('active'));
                        btn.classList.add('active');
                        loadEpisodes(movie.id, s.season_number, progress, requestId);
                    };
                    btn.onkeydown = e => {
                        const buttons = getSeasonButtons();
                        const index = buttons.indexOf(btn);
                        if (e.key === 'Enter') {
                            btn.click();
                            e.preventDefault();
                        }
                        if (e.key === 'ArrowDown') {
                            focusSeasonAt(index + 1, true);
                            e.preventDefault();
                        }
                        if (e.key === 'ArrowUp') {
                            focusSeasonAt(index - 1, true);
                            e.preventDefault();
                        }
                        if (e.key === 'ArrowRight') {
                            focusPreferredEpisode();
                            e.preventDefault();
                        }
                        if (e.key === 'ArrowLeft') {
                            DOM.playBtn?.focus();
                            e.preventDefault();
                        }
                    };
                    DOM.seasonTabs.appendChild(btn);

                    if (s.season_number === targetSeasonNumber) {
                        setTimeout(() => btn.scrollIntoView({ behavior: 'auto', block: 'nearest' }), 100);
                    }
                }
            });
            loadEpisodes(movie.id, targetSeasonNumber, progress, requestId);
        } else {
            DOM.seasonTabs.innerHTML = '<div class="details-empty-state">No seasons are available for this title.</div>';
        }
    } else {
        DOM.tvControls.classList.add('hidden');
        DOM.nextEpisodeBtn?.classList.add('hidden');
        updateMoviePlayLabel();

        bindWatchlistButton(movie);
        bindWatchedButton(movie);
        loadDetailsRecommendations(movie);
        DOM.playBtn.onclick = () => startScrapingSession(null, null);
        setupTvDetailNavigation();
        navigateTo('#details');
        setTimeout(() => DOM.playBtn.focus(), 150);
    }
}

async function loadEpisodes(tvId, seasonNum, progressRecord = null, requestId = detailsSessionId) {
    const loadId = ++episodeLoadId;
    DOM.episodeList.innerHTML = '<div style="color:#aaa; padding:20px;">Loading Episodes...</div>';
    const episodes = await fetchTVEpisodeList(tvId, seasonNum);
    if (loadId !== episodeLoadId || requestId !== detailsSessionId || String(currentMovieContext?.id) !== String(tvId)) return;
    if (episodes && episodes.length > 0) {
        DOM.episodeList.innerHTML = '';
        const progress = progressRecord || getSeriesProgress(tvId);
        let targetEpisodeBtn = null;

        episodes.forEach(e => {
            const card = document.createElement('div');
            card.className = 'episode-card-v2';
            card.tabIndex = 0;

            const epKey = `s${seasonNum}e${e.episode_number}`;
            const isWatched = progress.watched.includes(epKey);
            const isResumeTarget = seasonNum === progress.last_season && e.episode_number === progress.last_episode;
            const imgUrl = e.still_path ? `${IMAGE_URL}${e.still_path}` : 'https://via.placeholder.com/300x169?text=No+Preview';
            if (isResumeTarget) card.dataset.resume = 'true';

            card.innerHTML = `
                <div class="ep-thumb-wrapper">
                    <img src="${imgUrl}" class="ep-thumb-v2" loading="lazy" alt="${e.name || `Episode ${e.episode_number}`} preview">
                    <div class="ep-play-overlay"><i class="fa-solid fa-play" style="font-size:1.5rem; color:white;"></i></div>
                    ${isWatched ? '<div style="position:absolute; top:8px; left:8px; background:#46d369; color:white; padding:4px 8px; border-radius:4px; font-size:10px; font-weight:900; box-shadow:0 2px 5px rgba(0,0,0,0.3);">WATCHED</div>' : ''}
                </div>
                <div class="ep-info-v2">
                    <div class="ep-title-v2">${e.episode_number}. ${e.name || "TBA"}</div>
                    <div class="ep-meta-v2">
                        <span><i class="fa-regular fa-clock"></i> ${e.runtime || '?'} min</span>
                        <span><i class="fa-regular fa-calendar"></i> ${e.air_date || 'TBA'}</span>
                    </div>
                    <div class="ep-overview-v2">${e.overview || "No description available for this episode."}</div>
                </div>
            `;

            card.onclick = () => {
                DOM.playBtn.innerHTML = `<i class="fa-solid fa-play"></i> RESUME S${seasonNum}:E${e.episode_number}`;
                startScrapingSession(seasonNum, e.episode_number);
            };
            card.onkeydown = ev => {
                const cards = getEpisodeCards();
                const index = cards.indexOf(card);
                if (ev.key === 'Enter') {
                    card.click();
                    ev.preventDefault();
                }
                if (ev.key === 'ArrowDown') {
                    cards[index + 1]?.focus();
                    ev.preventDefault();
                }
                if (ev.key === 'ArrowUp') {
                    cards[Math.max(0, index - 1)]?.focus();
                    ev.preventDefault();
                }
                if (ev.key === 'ArrowLeft') {
                    const activeSeason = DOM.seasonTabs.querySelector('.active');
                    if (activeSeason) activeSeason.focus();
                    ev.preventDefault();
                }
            };

            DOM.episodeList.appendChild(card);

            if (isResumeTarget) {
                targetEpisodeBtn = card;
            }
        });

        setTimeout(() => {
            if (loadId !== episodeLoadId) return;
            if (episodeFocusRequested) {
                episodeFocusRequested = false;
                (targetEpisodeBtn || DOM.episodeList?.querySelector('.episode-card-v2'))?.focus();
            } else if (targetEpisodeBtn) {
                targetEpisodeBtn.scrollIntoView({ behavior: 'auto', block: 'center' });
            }
        }, 300);
    } else {
        episodeFocusRequested = false;
        DOM.episodeList.innerHTML = '<div class="details-empty-state">No episodes are available for this season.</div>';
    }
}

// =============================================
// MARCH 27 PROVEN ARCHITECTURE (a7b4290)
// Server API → Show Links → Auto-Play Best
// =============================================

async function startScrapingSession(targetS = null, targetE = null) {
    if (!currentMovieContext) return;
    cancelActiveExtraction();
    const sessionId = extractionSessionId;
    const sessionMovie = currentMovieContext;
    const controller = new AbortController();
    extractionAbortController = controller;
    const isCurrentSession = () => sessionId === extractionSessionId
        && currentMovieContext === sessionMovie
        && !controller.signal.aborted;
    currentNextEpisodeTarget = null;
    currentIntroMarker = null;
    try {
        await ensureExternalIds(sessionMovie, controller.signal);
    } catch (error) {
        if (error?.name === 'AbortError') return;
        throw error;
    }
    if (!isCurrentSession()) return;
    
    // Save to active profile history
    const activeProfileRaw = globalThis.localStorage.getItem('streamy_active_profile');
    const histKey = activeProfileRaw ? `streamy_history_${activeProfileRaw}` : 'streamy_history_default';
    let hList = JSON.parse(globalThis.localStorage.getItem(histKey) || '[]');
    hList = hList.filter(m => m.id !== sessionMovie.id);
    hList.unshift(sessionMovie);
    if (hList.length > 25) hList = hList.slice(0, 25);
    globalThis.localStorage.setItem(histKey, JSON.stringify(hList));

    DOM.serverList.innerHTML = '';
    DOM.sourceFilterControls?.classList.add('hidden');
    DOM.linksTitle.textContent = `Resolving: ${sessionMovie.title}`;
    DOM.scraperStatus.classList.remove('hidden');
    DOM.scraperStatus.innerHTML = '<p><i class="fa-solid fa-spinner fa-spin"></i> Proxying remote background extractors natively...</p>';
    
    navigateTo('#links');

    let s = 1, e = 1;
    if (sessionMovie.type === 'tv') {
        if (targetS !== null && targetE !== null) {
            s = targetS;
            e = targetE;
        } else {
            const progress = getSeriesProgress(sessionMovie.id);
            s = progress.last_season || 1;
            e = progress.last_episode || 1;
        }
        saveSeriesProgress(sessionMovie.id, s, e);
        try {
            currentNextEpisodeTarget = await resolveNextEpisodeTarget(s, e, sessionMovie, controller.signal);
        } catch (error) {
            if (error?.name === 'AbortError') return;
            throw error;
        }
        if (!isCurrentSession()) return;
    }
    
    const performExtraction = async (hostUrl) => {
        let apiUrl = `${hostUrl}/api/stream?tmdb=${sessionMovie.id}&type=${sessionMovie.type}&title=${encodeURIComponent(sessionMovie.title)}&year=${sessionMovie.year}`;
        const imdbId = getImdbId(sessionMovie);
        if (imdbId) apiUrl += `&imdb=${encodeURIComponent(imdbId)}`;
        if (sessionMovie.type === 'tv') apiUrl += `&season=${s}&episode=${e}`;

        console.log("[Extraction] Calling:", apiUrl);
        const requestController = new AbortController();
        let timedOut = false;
        const abortRequest = () => requestController.abort();
        const timeoutId = setTimeout(() => {
            timedOut = true;
            requestController.abort();
        }, EXTRACTION_REQUEST_TIMEOUT_MS);

        if (controller.signal.aborted) {
            requestController.abort();
        } else {
            controller.signal.addEventListener('abort', abortRequest, { once: true });
        }

        try {
            const res = await fetch(apiUrl, buildBackendFetchOptions(hostUrl, {
                signal: requestController.signal,
                cache: 'no-cache'
            }));
            const responseText = await res.text();
            let payload = null;

            try {
                payload = responseText ? JSON.parse(responseText) : null;
            } catch (error) {
                if (res.ok) throw new Error('Extraction node returned an invalid response');
            }

            if (!res.ok) {
                const detail = String(payload?.error || payload?.message || res.statusText || 'request failed')
                    .replace(/[<>&"']/g, '')
                    .replace(/\s+/g, ' ')
                    .slice(0, 160);
                throw new Error(`HTTP ${res.status}: ${detail}`);
            }
            if (!payload || typeof payload !== 'object') {
                throw new Error('Extraction node returned an empty response');
            }
            return payload;
        } catch (error) {
            if (controller.signal.aborted) {
                const abortError = new Error('Extraction cancelled');
                abortError.name = 'AbortError';
                throw abortError;
            }
            if (timedOut) {
                throw new Error(`Extraction node timed out after ${Math.round(EXTRACTION_REQUEST_TIMEOUT_MS / 1000)} seconds`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
            controller.signal.removeEventListener('abort', abortRequest);
        }
    };

    try {
        DOM.scraperStatus.innerHTML = '<p><i class="fa-solid fa-network-wired fa-fade"></i> Finding the best source broker...</p>';
        await discoverBackendHost().catch(error => {
            if (error?.name === 'AbortError') throw error;
            console.warn('[Extraction] Backend discovery failed before extraction:', error);
        });
        if (!isCurrentSession()) return;

        const primaryHost = getExtractionApi();
        const candidateHosts = [...new Set([primaryHost, UPDATE_SERVER].filter(Boolean))];
        const backendErrors = [];
        let data = null;

        for (let index = 0; index < candidateHosts.length; index++) {
            const host = candidateHosts[index];
            DOM.scraperStatus.innerHTML = index === 0
                ? '<p><i class="fa-solid fa-satellite-dish fa-fade"></i> Connecting to extraction grid...</p>'
                : '<p><i class="fa-solid fa-shield-halved fa-fade"></i> Primary unavailable. Trying backup node...</p>';

            try {
                data = await performExtraction(host);
                break;
            } catch (error) {
                if (error?.name === 'AbortError') throw error;
                const reason = error?.message || 'Network error';
                backendErrors.push(`${host}: ${reason}`);
                invalidateBackendHost(host);
                console.warn(`[Extraction] Host failed (${host}):`, reason);
            }
        }

        if (!data) {
            const reason = backendErrors.join(' | ') || 'No healthy extraction node was available';
            console.warn('[Extraction] Cloud extraction unavailable. Continuing with packaged backup sources.', reason);
            DOM.scraperStatus.innerHTML = '<p><i class="fa-solid fa-life-ring fa-fade"></i> Cloud node unavailable. Loading backup sources...</p>';
            data = {
                success: false,
                links: [],
                providerStatus: {
                    fallbackOnly: true,
                    degraded: true,
                    message: reason
                }
            };
            recordPlaybackDiagnostic({
                status: 'backend-degraded',
                reason,
                nativeMediaStatus: 'using-packaged-fallbacks'
            });
        }
        if (!isCurrentSession()) return;
        currentIntroMarker = sessionMovie.type === 'tv'
            ? normalizeIntroMarker(data.introMarker)
            : null;
        
        DOM.scraperStatus.classList.add('hidden');

        const configuredDirectLinks = await fetchConfiguredDirectLinks(s, e, sessionMovie, controller.signal);
        if (!isCurrentSession()) return;
        const mergedLinks = data.success
            ? mergeStreamLinks(data.links, getFallbackStreamLinks(sessionMovie, s, e))
            : getFallbackStreamLinks(sessionMovie, s, e);
        const links = filterLinksForPlaybackSettings(mergeStreamLinks(configuredDirectLinks, mergedLinks));

        if(links.length > 0) {
            currentPlaybackSeason = s;
            currentPlaybackEpisode = e;
            currentPlaybackLinks = sortStreamLinks(links);
            currentPlaybackSourceIndex = -1;
            const preferredBestLink = choosePreferredLink(currentPlaybackLinks);
            const preferredIndex = currentPlaybackLinks.indexOf(preferredBestLink);
            recordPlaybackDiagnostic({
                status: 'sources-ready',
                reason: `Resolved ${currentPlaybackLinks.length} playable/extractable sources`,
                nativeMediaStatus: 'not-started',
                link: preferredBestLink
            });
            
            activeSourceFilter = 'all';
            renderSourceList(preferredBestLink);
            const preferredButton = DOM.serverList?.querySelector('.server-btn.preferred') || DOM.serverList?.querySelector('.server-btn');
            preferredButton?.focus();

            if (preferredBestLink && getPlaybackSettings().autoplaySources) {
                setTimeout(() => {
                    if (!isCurrentSession() || globalThis.location.hash !== '#links') return;
                    playSourceAt(preferredIndex, 'autoplay-best-source');
                }, 800);
            } else {
                DOM.scraperStatus.classList.remove('hidden');
                DOM.scraperStatus.innerHTML = '<p><i class="fa-solid fa-list-check"></i> Sources ready. Pick a link to play.</p>';
            }
        } else {
            DOM.scraperStatus.classList.remove('hidden');
            DOM.scraperStatus.innerHTML = '<div style="color:var(--primary);"><i class="fa-solid fa-triangle-exclamation"></i> Extraction failed. Node proxy returned empty payload.</div>';
        }
    } catch (err) {
        if (err?.name === 'AbortError' || !isCurrentSession()) return;
        console.error("Stream extraction failed:", err);
        const currentHost = getExtractionApi();
        DOM.scraperStatus.classList.remove('hidden');
        DOM.scraperStatus.innerHTML = `
            <div style="color:white; background:#e50914; padding:20px; border-radius:12px; margin-top:20px; border:4px solid #fff; box-shadow:0 0 40px rgba(229,9,20,0.5);">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:32px;"></i> <b style="font-size:24px;">Extraction Error</b><br>
                <div style="background:rgba(0,0,0,0.5); padding:10px; border-radius:6px; margin-top:10px; text-align:left;">
                    <span style="font-size:14px;color:#ccc;display:block;">Primary Host: ${currentHost}</span>
                    <span style="font-size:14px;color:#ff9800;display:block;margin-top:5px;">Reason: ${err.message || "Network Error"}</span>
                    <div style="display:flex;gap:10px;margin-top:15px;">
                        <button onclick="location.reload()" style="flex:1;padding:10px;background:white;color:black;border:none;border-radius:4px;font-weight:bold;cursor:pointer;">RETRY CONNECTION</button>
                        <button id="copy-debug-logs-err-btn" style="flex:1;padding:10px;background:rgba(255,255,255,0.2);color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;">COPY DEBUG LOGS</button>
                    </div>
                </div>
            </div>
        `;

        const copyBtn = document.getElementById('copy-debug-logs-err-btn');
        if (copyBtn) {
            copyBtn.onclick = () => {
                const logs = getDiscoveryLogs();
                navigator.clipboard.writeText(logs).then(() => {
                    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> COPIED';
                    setTimeout(() => { if (copyBtn) copyBtn.innerText = 'COPY DEBUG LOGS'; }, 2000);
                });
            };
        }
    } finally {
        if (sessionId === extractionSessionId && extractionAbortController === controller) {
            extractionAbortController = null;
        }
    }
}

// =============================================
// PROVEN PLAYBACK FUNCTIONS (March 27 a7b4290)
// Simple, no gesture hacks, no bridge overrides
// =============================================

function playIframeFallback(iframeUrl, link = null, sourceIndex = currentPlaybackSourceIndex) {
    clearAutoplayCountdown();
    nearEndPromptDismissed = false;
    nearEndPromptShown = false;
    if (globalThis.NativeBridge && typeof globalThis.NativeBridge.openWebPlayer === 'function') {
        const mediaKey = getPlaybackMediaKey(currentMovieContext);
        const savedPositionMs = getSavedPlaybackPositionMs(currentMovieContext);
        const nextSeason = String(currentNextEpisodeTarget?.season || 0);
        const nextEpisode = String(currentNextEpisodeTarget?.episode || 0);
        const autoplayNextEpisode = String(getPlaybackSettings().autoplayNextEpisode);
        try {
            console.log(`[Autoplay] Passing browser target S${nextSeason}E${nextEpisode}, enabled=${autoplayNextEpisode}`);
            if (typeof globalThis.NativeBridge.openWebPlayerWithMetadata === 'function') {
                globalThis.NativeBridge.openWebPlayerWithMetadata(
                    iframeUrl,
                    `${currentMovieContext?.title || 'StreamOS'} | ${link?.server || 'Browser Player'}`,
                    String(currentMovieContext?.id || ''),
                    mediaKey,
                    String(savedPositionMs),
                    nextSeason,
                    nextEpisode,
                    getPlayableSourcePayload(),
                    String(sourceIndex),
                    autoplayNextEpisode,
                    getPlaybackMetadataPayload()
                );
            } else if (typeof globalThis.NativeBridge.openWebPlayerWithContext === 'function') {
                globalThis.NativeBridge.openWebPlayerWithContext(
                    iframeUrl,
                    `${currentMovieContext?.title || 'StreamOS'} | ${link?.server || 'Browser Player'}`,
                    String(currentMovieContext?.id || ''),
                    mediaKey,
                    String(savedPositionMs),
                    nextSeason,
                    nextEpisode,
                    getPlayableSourcePayload(),
                    String(sourceIndex),
                    autoplayNextEpisode
                );
            } else {
                globalThis.NativeBridge.openWebPlayer(
                    iframeUrl,
                    `${currentMovieContext?.title || 'StreamOS'} | ${link?.server || 'Browser Player'}`,
                    String(currentMovieContext?.id || ''),
                    mediaKey,
                    String(savedPositionMs),
                    nextSeason,
                    nextEpisode,
                    getPlayableSourcePayload(),
                    String(sourceIndex)
                );
            }
        } catch (error) {
            console.warn('[Autoplay] Full browser playback context failed; using compatibility bridge:', error);
            globalThis.NativeBridge.openWebPlayer(
                iframeUrl,
                `${currentMovieContext?.title || 'StreamOS'} | Browser Player`,
                String(currentMovieContext?.id || ''),
                mediaKey,
                String(savedPositionMs),
                String(currentNextEpisodeTarget?.season || 0),
                String(currentNextEpisodeTarget?.episode || 0)
            );
        }
        return;
    }

    DOM.videoPlayer.style.display = 'none';
    if (!DOM.videoPlayer.paused) DOM.videoPlayer.pause();
    
    let iframe = document.getElementById('fallback-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'fallback-iframe';
        iframe.frameBorder = '0';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.background = '#000';
        iframe.style.zIndex = '100';
        iframe.allowFullscreen = true;
        iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
        DOM.iframeWrapper.appendChild(iframe);
    }
    
    iframe.src = iframeUrl;
    iframe.style.display = 'block';
    startBrowserFailoverTimer(link, sourceIndex);
    
    navigateTo('#player');

    if (currentMovieContext?.type === 'tv') {
        DOM.playerNextEpBtn?.classList.remove('hidden');
        DOM.playerNextEpBtn.onclick = () => playNextEpisode();
    } else {
        DOM.playerNextEpBtn?.classList.add('hidden');
    }

    setTimeout(() => DOM.playerBackBtn?.focus(), 200);
}

function playNativeVideo(streamUrl, link = null, sourceIndex = currentPlaybackSourceIndex) {
    clearAutoplayCountdown();
    nearEndPromptDismissed = false;
    nearEndPromptShown = false;
    const hasNativeBridge = !!globalThis.NativeBridge && typeof globalThis.NativeBridge.playStream === 'function';
    const hasNativeResumeBridge = !!globalThis.NativeBridge && (
        typeof globalThis.NativeBridge.playStreamWithMetadata === 'function'
        || typeof globalThis.NativeBridge.playStreamWithContext === 'function'
        || typeof globalThis.NativeBridge.playStreamWithProgress === 'function'
    );
    const savedPositionMs = getSavedPlaybackPositionMs(currentMovieContext);
    const forceMaxVolume = () => {
        DOM.videoPlayer.defaultMuted = false;
        if (DOM.videoPlayer.muted || DOM.videoPlayer.volume < 0.99) {
            DOM.videoPlayer.muted = false;
            DOM.videoPlayer.volume = 1;
        }
    };

    // Preserve direct-stream playback in the native Android player. Fire TV
    // video rendering proved unreliable when direct links fell back to browser-
    // hosted playback, so this branch should remain the preferred path.
    if (hasNativeBridge) {
        const nativeMimeType = streamUrl.includes('m3u8')
            ? "application/vnd.apple.mpegurl"
            : "video/mp4";
        console.log("[Bridge] Triggering Native ExoPlayer for direct stream");
        if (hasNativeResumeBridge) {
            const nextSeason = String(currentNextEpisodeTarget?.season || 0);
            const nextEpisode = String(currentNextEpisodeTarget?.episode || 0);
            const autoplayNextEpisode = String(getPlaybackSettings().autoplayNextEpisode);
            try {
                console.log(`[Autoplay] Passing native target S${nextSeason}E${nextEpisode}, enabled=${autoplayNextEpisode}`);
                if (typeof globalThis.NativeBridge.playStreamWithMetadata === 'function') {
                    globalThis.NativeBridge.playStreamWithMetadata(
                        streamUrl,
                        nativeMimeType,
                        currentMovieContext.title,
                        getPlaybackMediaKey(currentMovieContext),
                        String(savedPositionMs),
                        link?.referer || '',
                        link?.origin || '',
                        link?.cookie || '',
                        getPlayableSourcePayload(),
                        String(sourceIndex),
                        nextSeason,
                        nextEpisode,
                        autoplayNextEpisode,
                        getPlaybackMetadataPayload()
                    );
                } else if (typeof globalThis.NativeBridge.playStreamWithContext === 'function') {
                    globalThis.NativeBridge.playStreamWithContext(
                        streamUrl,
                        nativeMimeType,
                        currentMovieContext.title,
                        getPlaybackMediaKey(currentMovieContext),
                        String(savedPositionMs),
                        link?.referer || '',
                        link?.origin || '',
                        link?.cookie || '',
                        getPlayableSourcePayload(),
                        String(sourceIndex),
                        nextSeason,
                        nextEpisode,
                        autoplayNextEpisode
                    );
                } else if (typeof globalThis.NativeBridge.playStreamWithHeaders === 'function') {
                    globalThis.NativeBridge.playStreamWithHeaders(
                        streamUrl,
                        nativeMimeType,
                        currentMovieContext.title,
                        getPlaybackMediaKey(currentMovieContext),
                        String(savedPositionMs),
                        link?.referer || '',
                        link?.origin || '',
                        link?.cookie || '',
                        getPlayableSourcePayload(),
                        String(sourceIndex),
                        nextSeason,
                        nextEpisode
                    );
                } else {
                    globalThis.NativeBridge.playStreamWithProgress(
                        streamUrl,
                        nativeMimeType,
                        currentMovieContext.title,
                        getPlaybackMediaKey(currentMovieContext),
                        String(savedPositionMs),
                        getPlayableSourcePayload(),
                        String(sourceIndex),
                        nextSeason,
                        nextEpisode
                    );
                }
            } catch (error) {
                console.warn('[Autoplay] Full native playback context failed; using compatibility bridge:', error);
                globalThis.NativeBridge.playStreamWithProgress(
                    streamUrl,
                    nativeMimeType,
                    currentMovieContext.title,
                    getPlaybackMediaKey(currentMovieContext),
                    String(savedPositionMs)
                );
            }
        } else {
            globalThis.NativeBridge.playStream(streamUrl, nativeMimeType, currentMovieContext.title);
        }
        return;
    }

    // Also check StreamyPlayer bridge (v85 Capacitor bridge name)
    if (globalThis.StreamyPlayer && typeof globalThis.StreamyPlayer.playStream === 'function') {
        console.log("[Bridge] Routing to StreamyPlayer...");
        const mimeType = streamUrl.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4';
        globalThis.StreamyPlayer.playStream(
            streamUrl,
            mimeType,
            currentMovieContext?.title || "StreamOS Video",
            getPlaybackMediaKey(currentMovieContext),
            savedPositionMs
        );
        return;
    }

    let iframe = document.getElementById('fallback-iframe');
    if (iframe) iframe.style.display = 'none';
    DOM.videoPlayer.style.display = 'block';
    navigateTo('#player');

    if (currentMovieContext?.type === 'tv') {
        DOM.playerNextEpBtn?.classList.remove('hidden');
        DOM.playerNextEpBtn.onclick = () => playNextEpisode();
    } else {
        DOM.playerNextEpBtn?.classList.add('hidden');
    }

    setTimeout(() => DOM.playerBackBtn?.focus(), 250);
    
    forceMaxVolume();
    DOM.videoPlayer.onvolumechange = forceMaxVolume;

    const isM3U8 = streamUrl.includes('.m3u8');
    const canPlayNativeHLS = DOM.videoPlayer.canPlayType('application/vnd.apple.mpegurl');

    if (isM3U8 && !canPlayNativeHLS && globalThis.Hls && Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(DOM.videoPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            clearBrowserFailoverTimer();
            markSourceResult(link, 'success', 'Browser HLS manifest parsed');
            recordPlaybackDiagnostic({ status: 'playing-browser-hls', reason: 'manifest-parsed', nativeMediaStatus: 'browser-playback', link });
            if (savedPositionMs >= 30000) {
                try {
                    DOM.videoPlayer.currentTime = savedPositionMs / 1000;
                } catch (error) {
                    console.warn("[Player] Failed to seek to saved progress:", error);
                }
            }
            forceMaxVolume();
            DOM.videoPlayer.play().catch(e => console.warn(e));
        });
        hls.on(Hls.Events.ERROR, function(event, data) {
            if (data?.fatal) {
                markSourceResult(link, 'failed', `Fatal HLS error: ${data.type || 'unknown'}`);
                recordPlaybackDiagnostic({ status: 'source-error', reason: `Fatal HLS error: ${data.type || 'unknown'}`, nativeMediaStatus: 'browser-error', link });
                playNextSource('fatal-hls-error');
            }
        });
    } else {
        DOM.videoPlayer.src = streamUrl;
        DOM.videoPlayer.addEventListener('loadedmetadata', function() {
            clearBrowserFailoverTimer();
            markSourceResult(link, 'success', 'Browser metadata loaded');
            recordPlaybackDiagnostic({ status: 'playing-browser-video', reason: 'loadedmetadata', nativeMediaStatus: 'browser-playback', link });
            if (savedPositionMs >= 30000) {
                try {
                    DOM.videoPlayer.currentTime = savedPositionMs / 1000;
                } catch (error) {
                    console.warn("[Player] Failed to seek to saved progress:", error);
                }
            }
            forceMaxVolume();
            DOM.videoPlayer.play().catch(e => console.warn("Autoplay block:", e));
        }, {once: true});
    }
    DOM.videoPlayer.onerror = () => {
        markSourceResult(link, 'failed', 'Browser video element error');
        recordPlaybackDiagnostic({ status: 'source-error', reason: 'Browser video element error', nativeMediaStatus: 'browser-error', link });
        playNextSource('browser-video-error');
    };
    DOM.videoPlayer.addEventListener('play', forceMaxVolume, { once: true });
    DOM.videoPlayer.addEventListener('canplay', forceMaxVolume, { once: true });
    bindWebPlaybackProgress(DOM.videoPlayer);
}

// =============================================
// AUTOPLAY NEXT EPISODE (kept from post-March 27)
// =============================================

let autoplayTimer = null;
function clearAutoplayCountdown() {
    if (autoplayTimer) clearInterval(autoplayTimer);
    autoplayTimer = null;
    DOM.autoplayOverlay.classList.add('hidden');
}

async function showAutoplayCountdown() {
    if (!currentMovieContext || currentMovieContext.type !== 'tv') return;
    if (!getPlaybackSettings().autoplayNextEpisode || nearEndPromptDismissed) return;
    const requestMovie = currentMovieContext;
    const nextTarget = currentNextEpisodeTarget || await getNextEpisodeTarget();
    if (!nextTarget || requestMovie !== currentMovieContext) return;

    clearAutoplayCountdown();
    currentNextEpisodeTarget = nextTarget;
    nearEndPromptShown = false;
    DOM.autoplayNextTitle.innerText = `Up next: S${nextTarget.season} E${nextTarget.episode}`;
    
    DOM.autoplayOverlay.classList.remove('hidden');
    let seconds = 5;
    DOM.autoplayCountdown.innerText = seconds;
    if (DOM.autoplaySkipBtn) {
        DOM.autoplaySkipBtn.onclick = () => {
            clearAutoplayCountdown();
            playNextEpisode();
        };
    }
    
    DOM.autoplayCancelBtn.onclick = () => {
        clearAutoplayCountdown();
        nearEndPromptDismissed = true;
    };
    
    setTimeout(() => DOM.autoplaySkipBtn?.focus(), 100);

    autoplayTimer = setInterval(() => {
        seconds--;
        DOM.autoplayCountdown.innerText = seconds;
        if (seconds <= 0) {
            clearAutoplayCountdown();
            playNextEpisode();
        }
    }, 1000);
}

async function playNextEpisode() {
    if (!currentMovieContext || currentMovieContext.type !== 'tv') {
        DOM.playerBackBtn.click();
        return;
    }

    try {
        const target = currentNextEpisodeTarget || await getNextEpisodeTarget();
        if (!target) {
            console.log("[Autoplay] End of Series reached.");
            DOM.playerBackBtn.click();
            return;
        }

        console.log(`[Autoplay] Moving to S${target.season} E${target.episode}`);
        startScrapingSession(target.season, target.episode);
    } catch (err) {
        console.error("[Autoplay] Failed to transition to next episode:", err);
        DOM.playerBackBtn.click();
    }
}

if (DOM.playerServerCycleBtn) {
    DOM.playerServerCycleBtn.innerHTML = '<i class="fa-solid fa-list"></i> Source List';
    DOM.playerServerCycleBtn.onclick = () => navigateTo('#links');
}

if (DOM.playerReloadSourceBtn) {
    DOM.playerReloadSourceBtn.onclick = () => reloadCurrentSource();
}

if (DOM.playerNextSourceBtn) {
    DOM.playerNextSourceBtn.onclick = () => playNextSource('manual-next-source');
}

if (DOM.playerDetailsBtn) {
    DOM.playerDetailsBtn.onclick = () => navigateTo('#details');
}

if (DOM.playerBackBtn) {
    DOM.playerBackBtn.addEventListener('click', () => globalThis.history.back());
}

if (DOM.playerFullscreenBtn) {
    DOM.playerFullscreenBtn.addEventListener('click', () => {
        let elem = document.getElementById('fallback-iframe') || DOM.videoPlayer;
        if (elem?.style.display !== 'none') {
            if (elem.requestFullscreen) elem.requestFullscreen();
            else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
        }
    });
}

globalThis.StreamOSNative = globalThis.StreamOSNative || {};
globalThis.StreamOSNative.playNextEpisodeFromNative = (season, episode) => {
    if (!currentMovieContext || currentMovieContext.type !== 'tv') return false;
    const nextSeason = Number(season);
    const nextEpisode = Number(episode);
    if (!Number.isFinite(nextSeason) || !Number.isFinite(nextEpisode) || nextSeason <= 0 || nextEpisode <= 0) return false;
    const requestKey = `${currentMovieContext.id}:s${nextSeason}:e${nextEpisode}`;
    if (nativeNextEpisodeRequestKey === requestKey) return true;
    nativeNextEpisodeRequestKey = requestKey;
    startScrapingSession(nextSeason, nextEpisode);
    return true;
};

globalThis.addEventListener('hashchange', () => {
    if (extractionAbortController && globalThis.location.hash !== '#links') {
        cancelActiveExtraction();
    }
});
