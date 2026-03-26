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
export async function fetchMusicFromProxy(endpoint) {
    try {
        const res = await fetch(`http://localhost:3000/api${endpoint}`);
        const data = await res.json();
        return data;
    } catch (e) {
        console.error("Music Proxy error:", e);
        return { data: [], status: "error" };
    }
}

export async function searchMusic(query) {
    return await fetchMusicFromProxy(`/streamex/search?s=${encodeURIComponent(query)}&limit=20`);
}

export async function fetchMusicChart(id, type = 'chart') {
    const endpoint = (type === 'playlist' || (id && id.length > 5)) ? `/deezer/playlist/${id}/tracks` : `/deezer/chart/${id}/tracks`;
    return await fetchMusicFromProxy(`${endpoint}?limit=20`);
}

export async function fetchMusicManifest(trackId) {
    return await fetchMusicFromProxy(`/streamex/track?id=${trackId}&quality=LOSSLESS`);
}
