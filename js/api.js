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
    } catch(e) { return null; }
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
    } catch(e) {}
}

export async function clearAPICache() {
    try {
        globalThis.indexedDB.deleteDatabase(DB_NAME);
        return true;
    } catch(e) { return false; }
}

export async function fetchFromTMDB(endpoint) {
    const activeProfileRaw = globalThis.localStorage.getItem('beetv_active_profile');
    if (activeProfileRaw) {
        try {
            const profilesRaw = globalThis.localStorage.getItem('beetv_profiles');
            const profiles = JSON.parse(profilesRaw || '[]');
            const profile = profiles.find(p => p.id === activeProfileRaw);

            if (profile && profile.isKid) {
                if (endpoint.includes('/movie') || endpoint.includes('movie')) {
                    endpoint += (endpoint.includes('?') ? '&' : '?') + 'certification_country=US&certification.lte=PG';
                } else if (endpoint.includes('/tv') || endpoint.includes('tv')) {
                    endpoint += (endpoint.includes('?') ? '&' : '?') + 'certification_country=US&certification.lte=TV-PG';
                } else {
                    endpoint += (endpoint.includes('?') ? '&' : '?') + 'certification_country=US&certification.lte=PG';
                }
            }
        } catch(e) {}
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
function getProxyHost() {
    // Priority: 1. Local Browser/Dev 2. Native App with Local Server 3. Remote/Live Fallback
    const isLocal = globalThis.location.hostname === 'localhost' || globalThis.location.hostname === '127.0.0.1';
    if (isLocal) return 'http://localhost:3000';
    
    // Live Render Proxy (Global Fallback for Mobile/Production)
    return 'https://streamy-vez5.onrender.com';
}

export async function fetchMusicFromProxy(endpoint) {
    try {
        const host = getProxyHost();
        const res = await fetch(`${host}/api${endpoint}`);
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
    return await fetchMusicDirect(`https://streamex.sh/api/music/search?s=${encodeURIComponent(query)}&limit=20`);
}

export function fetchDeezerJSONP(endpoint) {
    return new Promise((resolve) => {
        const callbackName = 'deezer_cb_' + Math.round(100000 * Math.random());
        window[callbackName] = function(data) {
            delete window[callbackName];
            document.body.removeChild(script);
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
        const res = await fetch(`${host}/api/saavn/search/songs?query=${encodeURIComponent(query)}&limit=5`);
        return await res.json();
    } catch (e) {
        return { data: { results: [] } };
    }
}
