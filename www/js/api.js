export const TMDB_API_KEY = 'a9b4a682953630df7df70fb2178528b8';
export const BASE_URL = 'https://api.themoviedb.org/3';
export const IMAGE_URL = 'https://image.tmdb.org/t/p/w500';
export const BACKDROP_URL = 'https://image.tmdb.org/t/p/w1280';

const DB_NAME = 'Streamy_CacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'tmdb_cache';

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

function getKidModeParams(endpoint, profile) {
    if (!profile?.isKid) return '';
    let category = 'default';
    if (endpoint.includes('/movie') || endpoint.includes('movie')) category = 'movie';
    else if (endpoint.includes('/tv') || endpoint.includes('tv')) category = 'tv';
    
    const limit = category === 'tv' ? 'TV-14' : 'PG-13';
    return `${endpoint.includes('?') ? '&' : '?'}certification_country=US&certification.lte=${limit}`;
}

export async function fetchFromTMDB(endpoint) {
    const activeProfileId = globalThis.localStorage.getItem('streamy_active_profile');
    if (activeProfileId) {
        try {
            const profiles = JSON.parse(globalThis.localStorage.getItem('streamy_profiles') || '[]');
            const profile = profiles.find(p => p.id === activeProfileId);
            endpoint += getKidModeParams(endpoint, profile);
        } catch(e) {
            console.warn("[Profile] Kid-mode check failed:", e);
        }
    }

    const separator = endpoint.includes('?') ? '&' : '?';
    const requestUrl = `${BASE_URL}${endpoint}${separator}api_key=${TMDB_API_KEY}`;
    
    const cachedItem = await getCache(requestUrl);
    // 12 hours cache
    if (cachedItem && (Date.now() - cachedItem.timestamp) < 43200000) {
        return cachedItem.data.results || cachedItem.data || [];
    }

    try {
        const res = await fetch(requestUrl);
        if(res.status === 401) {
            console.error("API Key Required or Invalid");
            return [];
        }
        const data = await res.json();
        await setCache(requestUrl, data);
        return data.results ? data.results : data;
    } catch (e) {
        console.error("TMDB error:", e);
        return [];
    }
}

export async function discoverByCategory(type, payload, page = 1) {
    if (payload === 'trending') return await fetchFromTMDB(`/trending/${type}/day?page=${page}`);
    if (payload.startsWith('company:')) {
        const companyId = payload.split(':')[1];
        return await fetchFromTMDB(`/discover/${type}?with_companies=${companyId}&page=${page}`);
    }
    if (payload.startsWith('network:')) {
        const networkId = payload.split(':')[1];
        return await fetchFromTMDB(`/discover/${type}?with_networks=${networkId}&page=${page}`);
    }
    // Assume genre or explicit parameter list fallback
    if (payload.includes('=')) {
        return await fetchFromTMDB(`/discover/${type}?${payload}&page=${page}`);
    }
    return await fetchFromTMDB(`/discover/${type}?with_genres=${payload}&page=${page}`);
}

export async function fetchTVSeasons(tvId) {
    const data = await fetchFromTMDB(`/tv/${tvId}`);
    return data.seasons || [];
}

export async function fetchTVEpisodeList(tvId, seasonNum) {
    const data = await fetchFromTMDB(`/tv/${tvId}/season/${seasonNum}`);
    return data.episodes || [];
}

// MUSIC API (PROXIED)
// BACKEND DISCOVERY SYSTEM (v77)
let discoveredHost = globalThis.localStorage.getItem('streamy_backend_host') || null;
const discoveryLogs = [];

function logDiscovery(msg) {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log(entry);
    discoveryLogs.push(entry);
    if (discoveryLogs.length > 50) discoveryLogs.shift();
}

export function getDiscoveryLogs() {
    return discoveryLogs.join('\n');
}

export function setManualBackendHost(host) {
    if (host) {
        const formatted = host.replace(/\/$/, '');
        discoveredHost = formatted;
        globalThis.localStorage.setItem('streamy_backend_host', formatted);
        logDiscovery(`Manual override set: ${formatted}`);
    } else {
        globalThis.localStorage.removeItem('streamy_backend_host');
        discoveredHost = null;
        logDiscovery("Manual override cleared. System will use auto-discovery on next probe.");
    }
}

export async function discoverBackendHost() {
    logDiscovery("Initiating Resilient Backend Search...");
    
    // 1. Fetch Tunnel URL from local disk (if packaged)
    let tunnelUrl = null;
    try {
        const tunnelRes = await fetch('tunnel_url.txt').catch(() => null);
        if (tunnelRes?.ok) {
            const raw = await tunnelRes.text();
            const match = raw.match(/https?:\/\/[^\s]+/);
            if (match) {
                tunnelUrl = match[0].trim();
                logDiscovery(`Found Tunnel URL in local disk: ${tunnelUrl}`);
            }
        }
    } catch (e) {
        logDiscovery(`Tunnel file read failed: ${e.message}`);
    }

    const rawHosts = [
        discoveredHost, // Previously working or manual
        'http://192.168.4.65:3000', // Hardcoded Local Dev IP
        tunnelUrl, // Parsed from tunnel_url.txt
        'http://localhost:3000', // Loopback
        'https://streamy-vez5.onrender.com' // Cloud Production
    ];
    const POTENTIAL_HOSTS = rawHosts.filter(h => h?.startsWith('http'));

    // Remove duplicates
    const uniqueHosts = [...new Set(POTENTIAL_HOSTS)];
    logDiscovery(`Probing Candidates: ${uniqueHosts.join(', ')}`);

    const probe = async (host) => {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000); // 2s timeout per probe
            const res = await fetch(`${host}/api/ota`, { 
                signal: controller.signal,
                headers: { 'bypass-tunnel-reminder': 'true' }
            });
            clearTimeout(timeout);
            logDiscovery(`Probe ${host}: ${res.ok ? 'OK' : 'FAILED (' + res.status + ')'}`);
            return res.ok;
        } catch (e) { 
            logDiscovery(`Probe ${host}: ERROR (${e.message})`);
            return false; 
        }
    };

    for (const host of uniqueHosts) {
        if (await probe(host)) {
            logDiscovery(`SUCCESS! Host selected: ${host}`);
            discoveredHost = host;
            globalThis.localStorage.setItem('streamy_backend_host', host);
            return host;
        }
    }

    logDiscovery("All candidates failed. Falling back to Production.");
    discoveredHost = 'https://streamy-vez5.onrender.com';
    return discoveredHost;
}

export function getProxyHost() {
    // If we have a discovered host, use it. Otherwise, return fallback and let discovery catch up.
    return discoveredHost || 'https://streamy-vez5.onrender.com';
}

export async function fetchMusicFromProxy(endpoint) {
    try {
        const host = getProxyHost();
        const res = await fetch(`${host}/api${endpoint}`, {
            headers: { 'bypass-tunnel-reminder': 'true' }
        });
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
        const res = await fetch(`${host}/api/saavn/search/songs?query=${encodeURIComponent(query)}&limit=5`, {
            headers: { 'bypass-tunnel-reminder': 'true' }
        });
        const data = await res.json();
        return data;
    } catch (e) {
        console.warn("[Saavn] Search failed:", e);
        return { data: { results: [] } };
    }
}
