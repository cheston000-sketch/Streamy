import {
    areRatingsKidsSafe,
    getEmbeddedUsRatings,
    getUsRatingsFromPayload,
    hasKidsSafeCatalogShape,
    resolveMediaType
} from './kids-safety.js?v=136';

export const TMDB_API_KEY = 'a9b4a682953630df7df70fb2178528b8';
export const BASE_URL = 'https://api.themoviedb.org/3';
export const IMAGE_URL = 'https://image.tmdb.org/t/p/w500';
export const BACKDROP_URL = 'https://image.tmdb.org/t/p/w1280';

const DB_NAME = 'Streamy_CacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'tmdb_cache';
export const CACHE_DB_NAME = DB_NAME;

function isTunnelHost(host) {
    const lower = (host || '').toLowerCase();
    return lower.includes('ngrok')
        || lower.includes('trycloudflare')
        || lower.includes('loca.lt')
        || lower.includes('localhost.run');
}

export function buildBackendFetchOptions(host, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (isTunnelHost(host)) {
        headers['bypass-tunnel-reminder'] = 'true';
    }

    return {
        ...options,
        headers
    };
}

// IndexedDB Wrapper natively
function getDB() {
    return new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'url' });
            }
        };
    });
}

async function getCache(url) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(url);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    } catch(e) { 
        console.warn("[Cache] Read error:", e);
        return null; 
    }
}

async function setCache(url, data) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put({ url, timestamp: Date.now(), data });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch(e) {
        console.warn("[Cache] Write error:", e);
    }
}

export async function clearAPICache() {
    try {
        globalThis.indexedDB.deleteDatabase(DB_NAME);
        return true;
    } catch(e) { 
        console.warn("[Cache] Clear error:", e);
        return false; 
    }
}

function getActiveProfile() {
    const activeProfileId = globalThis.localStorage.getItem('streamy_active_profile');
    if (!activeProfileId) return null;
    try {
        const profiles = JSON.parse(globalThis.localStorage.getItem('streamy_profiles') || '[]');
        return profiles.find(profile => profile?.id === activeProfileId) || null;
    } catch (error) {
        console.warn('[Profile] Unable to read active profile:', error);
        return null;
    }
}

export function isKidsProfileActive() {
    return getActiveProfile()?.isKid === true;
}

function getKidModeParams(endpoint, profile) {
    if (!profile?.isKid) return '';
    if (!endpoint.includes('/discover/')) return endpoint.includes('?') ? '&include_adult=false' : '?include_adult=false';

    let category = 'default';
    if (endpoint.includes('/movie') || endpoint.includes('movie')) category = 'movie';
    else if (endpoint.includes('/tv') || endpoint.includes('tv')) category = 'tv';

    const limit = category === 'tv' ? 'TV-G' : 'PG';
    return `${endpoint.includes('?') ? '&' : '?'}include_adult=false&certification_country=US&certification.lte=${limit}`;
}

function inferMediaTypeFromEndpoint(endpoint) {
    if (/\/(?:discover|trending|search)?\/?tv(?:\/|\?|$)/.test(endpoint) || endpoint.startsWith('/tv/')) return 'tv';
    if (/\/(?:discover|trending|search)?\/?movie(?:\/|\?|$)/.test(endpoint) || endpoint.startsWith('/movie/')) return 'movie';
    return '';
}

async function fetchTmdbRatingPayload(endpoint, signal) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const requestUrl = `${BASE_URL}${endpoint}${separator}api_key=${TMDB_API_KEY}`;
    const cachedItem = await getCache(requestUrl);
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    if (cachedItem && (Date.now() - cachedItem.timestamp) < 43200000) return cachedItem.data;

    const response = await fetch(requestUrl, { signal });
    if (!response.ok) throw new Error(`TMDB rating request failed (${response.status})`);
    const data = await response.json();
    await setCache(requestUrl, data);
    return data;
}

async function isKidsRatedItem(item, fallbackType, signal) {
    if (!hasKidsSafeCatalogShape(item, fallbackType)) return false;
    const mediaType = resolveMediaType(item, fallbackType);
    const embeddedRatings = getEmbeddedUsRatings(item);
    if (embeddedRatings.length) return areRatingsKidsSafe(mediaType, embeddedRatings);

    try {
        const endpoint = mediaType === 'movie'
            ? `/movie/${item.id}/release_dates`
            : `/tv/${item.id}/content_ratings`;
        const payload = await fetchTmdbRatingPayload(endpoint, signal);
        return areRatingsKidsSafe(mediaType, getUsRatingsFromPayload(payload, mediaType));
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        console.warn(`[Kids] Excluding unrated title ${mediaType}:${item.id}:`, error.message);
        return false;
    }
}

export async function filterItemsForActiveProfile(items, fallbackType = '', options = {}) {
    const list = Array.isArray(items) ? items : [];
    if (!isKidsProfileActive()) return list;

    const { signal } = options;
    const approved = new Array(list.length).fill(false);
    let cursor = 0;
    const workerCount = Math.min(5, list.length);
    const workers = Array.from({ length: workerCount }, async () => {
        while (cursor < list.length) {
            const index = cursor++;
            if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
            approved[index] = await isKidsRatedItem(list[index], fallbackType, signal);
        }
    });
    await Promise.all(workers);
    return list.filter((_, index) => approved[index]);
}

export async function fetchFromTMDB(endpoint, options = {}) {
    const { signal } = options;
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    const profile = getActiveProfile();
    endpoint += getKidModeParams(endpoint, profile);

    const separator = endpoint.includes('?') ? '&' : '?';
    const requestUrl = `${BASE_URL}${endpoint}${separator}api_key=${TMDB_API_KEY}`;
    
    const cachedItem = await getCache(requestUrl);
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    // 12 hours cache
    if (cachedItem && (Date.now() - cachedItem.timestamp) < 43200000) {
        const cachedResult = cachedItem.data.results || cachedItem.data || [];
        return profile?.isKid && Array.isArray(cachedResult)
            ? filterItemsForActiveProfile(cachedResult, inferMediaTypeFromEndpoint(endpoint), { signal })
            : cachedResult;
    }

    try {
        const res = await fetch(requestUrl, { signal });
        if(res.status === 401) {
            console.error("API Key Required or Invalid");
            return [];
        }
        const data = await res.json();
        await setCache(requestUrl, data);
        const result = data.results ? data.results : data;
        return profile?.isKid && Array.isArray(result)
            ? filterItemsForActiveProfile(result, inferMediaTypeFromEndpoint(endpoint), { signal })
            : result;
    } catch (e) {
        if (e?.name === 'AbortError') throw e;
        console.error("TMDB error:", e);
        return [];
    }
}

export async function discoverByCategory(type, payload, page = 1, options = {}) {
    if (payload === 'trending') return await fetchFromTMDB(`/trending/${type}/day?page=${page}`, options);
    if (payload === 'trending_week') return await fetchFromTMDB(`/trending/${type}/week?page=${page}`, options);
    if (payload === 'popular') return await fetchFromTMDB(`/${type}/popular?page=${page}`, options);
    if (payload === 'top_rated') return await fetchFromTMDB(`/${type}/top_rated?page=${page}`, options);
    if (payload === 'now_playing' && type === 'movie') return await fetchFromTMDB(`/movie/now_playing?page=${page}`, options);
    if (payload === 'upcoming' && type === 'movie') return await fetchFromTMDB(`/movie/upcoming?page=${page}`, options);
    if (payload === 'airing_today' && type === 'tv') return await fetchFromTMDB(`/tv/airing_today?page=${page}`, options);
    if (payload === 'on_the_air' && type === 'tv') return await fetchFromTMDB(`/tv/on_the_air?page=${page}`, options);
    if (payload.startsWith('company:')) {
        const companyId = payload.split(':')[1];
        return await fetchFromTMDB(`/discover/${type}?with_companies=${companyId}&page=${page}`, options);
    }
    if (payload.startsWith('network:')) {
        const networkId = payload.split(':')[1];
        return await fetchFromTMDB(`/discover/${type}?with_networks=${networkId}&page=${page}`, options);
    }
    // Assume genre or explicit parameter list fallback
    if (payload.includes('=')) {
        return await fetchFromTMDB(`/discover/${type}?${payload}&page=${page}`, options);
    }
    return await fetchFromTMDB(`/discover/${type}?with_genres=${payload}&page=${page}`, options);
}

export async function fetchTVSeasons(tvId, options = {}) {
    const data = await fetchFromTMDB(`/tv/${tvId}`, options);
    return data.seasons || [];
}

export async function fetchTVEpisodeList(tvId, seasonNum, options = {}) {
    const data = await fetchFromTMDB(`/tv/${tvId}/season/${seasonNum}`, options);
    return data.episodes || [];
}

// MUSIC API (PROXIED)
// BACKEND DISCOVERY SYSTEM (v77)
let discoveredHost = globalThis.localStorage.getItem('streamy_backend_host') || null;
let manualBackendHost = globalThis.localStorage.getItem('streamy_backend_manual_host') || null;
let discoveryPromise = null;
let lastDiscoveryAt = 0;
const discoveryLogs = [];
const LOCAL_DEV_HOST = 'http://192.168.4.65:3000';
const PRODUCTION_HOST = 'https://streamy-vez5.onrender.com';
const DISCOVERY_CACHE_MS = 60_000;
const PROBE_TIMEOUT_MS = 4_000;
const PRODUCTION_PROBE_TIMEOUT_MS = 15_000;

function logDiscovery(msg) {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log(entry);
    discoveryLogs.push(entry);
    if (discoveryLogs.length > 50) discoveryLogs.shift();
}

export function getDiscoveryLogs() {
    return discoveryLogs.join('\n');
}

export function rememberDiscoveredBackendHost(host) {
    if (!host || manualBackendHost) return getProxyHost();
    discoveredHost = host.replace(/\/$/, '');
    globalThis.localStorage.setItem('streamy_backend_host', discoveredHost);
    lastDiscoveryAt = Date.now();
    return discoveredHost;
}

export function invalidateBackendHost(host) {
    const normalizedHost = String(host || '').replace(/\/$/, '');
    if (!normalizedHost || normalizedHost === manualBackendHost) return;

    if (discoveredHost === normalizedHost) {
        discoveredHost = null;
        globalThis.localStorage.removeItem('streamy_backend_host');
    }
    lastDiscoveryAt = 0;
    logDiscovery(`Invalidated failed backend: ${normalizedHost}`);
}

export function setManualBackendHost(host) {
    if (host) {
        const formatted = host.replace(/\/$/, '');
        manualBackendHost = formatted;
        discoveredHost = formatted;
        globalThis.localStorage.setItem('streamy_backend_manual_host', formatted);
        globalThis.localStorage.setItem('streamy_backend_host', formatted);
        lastDiscoveryAt = Date.now();
        logDiscovery(`Manual override set: ${formatted}`);
    } else {
        globalThis.localStorage.removeItem('streamy_backend_manual_host');
        globalThis.localStorage.removeItem('streamy_backend_host');
        manualBackendHost = null;
        discoveredHost = null;
        lastDiscoveryAt = 0;
        logDiscovery("Manual override cleared. System will use auto-discovery on next probe.");
    }
}

export function getManualBackendHost() {
    return manualBackendHost || '';
}

async function fetchProbeEndpoint(host, path, timeoutMs = PROBE_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(`${host}${path}`, buildBackendFetchOptions(host, {
            signal: controller.signal,
            cache: 'no-cache'
        }));
    } finally {
        clearTimeout(timeout);
    }
}

async function probeBackendHost(host) {
    const timeoutMs = host === PRODUCTION_HOST ? PRODUCTION_PROBE_TIMEOUT_MS : PROBE_TIMEOUT_MS;
    try {
        const healthResponse = await fetchProbeEndpoint(host, '/api/health', timeoutMs).catch(() => null);
        if (healthResponse?.ok) {
            const health = await healthResponse.json().catch(() => ({}));
            const providerApiReady = health.providerApi !== false;
            logDiscovery(`Probe ${host}: health OK${health.version ? ` (v${health.version})` : ''}`);
            return providerApiReady;
        }

        const [otaResult, providersResult] = await Promise.allSettled([
            fetchProbeEndpoint(host, '/api/ota', timeoutMs),
            fetchProbeEndpoint(host, '/api/providers', timeoutMs)
        ]);
        const otaResponse = otaResult.status === 'fulfilled' ? otaResult.value : null;
        const providersResponse = providersResult.status === 'fulfilled' ? providersResult.value : null;
        const otaOk = !!otaResponse?.ok;
        const providersOk = !!providersResponse?.ok;
        logDiscovery(`Probe ${host}: OTA ${otaOk ? 'OK' : 'FAILED'}, providers ${providersOk ? 'OK' : 'FAILED'}`);
        return otaOk && providersOk;
    } catch (error) {
        logDiscovery(`Probe ${host}: ERROR (${error.message})`);
        return false;
    }
}

async function findFirstHealthyHost(hosts) {
    if (!hosts.length) return null;

    return new Promise(resolve => {
        let pending = hosts.length;
        let settled = false;

        hosts.forEach(host => {
            probeBackendHost(host).then(ok => {
                if (ok && !settled) {
                    settled = true;
                    resolve(host);
                }
            }).finally(() => {
                pending--;
                if (pending === 0 && !settled) {
                    settled = true;
                    resolve(null);
                }
            });
        });
    });
}

export async function discoverBackendHost({ force = false } = {}) {
    if (!force && manualBackendHost) return manualBackendHost;
    if (!force && discoveredHost && Date.now() - lastDiscoveryAt < DISCOVERY_CACHE_MS) return discoveredHost;
    if (discoveryPromise) return discoveryPromise;

    discoveryPromise = (async () => {
        logDiscovery("Initiating resilient backend search...");

        const candidateHosts = [
            manualBackendHost,
            discoveredHost,
            PRODUCTION_HOST,
            LOCAL_DEV_HOST,
            'http://localhost:3000'
        ].filter(host => host?.startsWith('http'));
        const uniqueHosts = [...new Set(candidateHosts)];
        logDiscovery(`Probing candidates in parallel: ${uniqueHosts.join(', ')}`);

        const healthyHost = await findFirstHealthyHost(uniqueHosts);
        const selectedHost = healthyHost || PRODUCTION_HOST;

        if (healthyHost) {
            logDiscovery(`SUCCESS! Host selected: ${selectedHost}`);
        } else {
            logDiscovery("All probes failed. Falling back to production.");
        }

        discoveredHost = selectedHost;
        globalThis.localStorage.setItem('streamy_backend_host', selectedHost);
        lastDiscoveryAt = healthyHost ? Date.now() : 0;
        return selectedHost;
    })().finally(() => {
        discoveryPromise = null;
    });

    return discoveryPromise;
}

export function getProxyHost() {
    // If we have a discovered host, use it. Otherwise, return fallback and let discovery catch up.
    return discoveredHost || PRODUCTION_HOST;
}

export async function fetchMusicFromProxy(endpoint) {
    try {
        const host = getProxyHost();
        const res = await fetch(`${host}/api${endpoint}`, buildBackendFetchOptions(host));
        const data = await res.json();
        return data;
    } catch (e) {
        console.error("Music Proxy error:", e);
        return { data: [], status: "error" };
    }
}

// Helper for direct music API calls to bypass potentially blocked proxy
async function fetchMusicDirect(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Music API Error: ${res.status}`);
    return await res.json();
}

export async function searchMusic(query) {
    return await fetchMusicFromProxy(`/streamex/search?s=${encodeURIComponent(query)}&limit=25`);
}

export function fetchDeezerJSONP(endpoint) {
    return new Promise((resolve) => {
        const callbackName = 'deezer_cb_' + Math.round(100000 * Math.random());
        window[callbackName] = function(data) {
            delete window[callbackName];
            script.remove();
            resolve(data);
        };
        const script = document.createElement('script');
        const sep = endpoint.includes('?') ? '&' : '?';
        script.src = `https://api.deezer.com${endpoint}${sep}output=jsonp&callback=${callbackName}`;
        document.body.appendChild(script);
        script.onerror = () => resolve({ data: [] });
    });
}

export async function fetchMusicChart(id, type = 'chart') {
    const endpoint = (type === 'playlist' || (id && id.length > 5)) ? `/playlist/${id}/tracks` : `/chart/${id}/tracks`;
    return await fetchDeezerJSONP(`${endpoint}?limit=20`);
}

export async function fetchMusicManifest(trackId) {
    return await fetchMusicDirect(`https://streamex.sh/api/music/track?id=${trackId}&quality=HIGH`);
}

// SAAVN FALLBACK API
export async function searchMusicSaavn(query) {
    const host = getProxyHost();
    try {
        const res = await fetch(`${host}/api/saavn/search/songs?query=${encodeURIComponent(query)}&limit=5`, buildBackendFetchOptions(host));
        const data = await res.json();
        return data;
    } catch (e) {
        console.warn("[Saavn] Search failed:", e);
        return { data: { results: [] } };
    }
}
