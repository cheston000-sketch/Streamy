export const TMDB_API_KEY = 'a9b4a682953630df7df70fb2178528b8';
export const BASE_URL = 'https://api.themoviedb.org/3';
export const IMAGE_URL = 'https://image.tmdb.org/t/p/w500';
export const BACKDROP_URL = 'https://image.tmdb.org/t/p/original';

export async function fetchFromTMDB(endpoint) {
    try {
        const separator = endpoint.includes('?') ? '&' : '?';
        const res = await fetch(`${BASE_URL}${endpoint}${separator}api_key=${TMDB_API_KEY}`);
        if(res.status === 401) {
            console.error("API Key Required or Invalid");
            return [];
        }
        const data = await res.json();
        return data.results || [];
    } catch (e) {
        console.error("TMDB error:", e);
        return [];
    }
}

export async function discoverByCategory(type, payload, page = 1) {
    if (payload === 'trending') return await fetchFromTMDB(`/trending/${type}/day?page=${page}`);
    if (payload.startsWith('company-')) {
        const companyId = payload.split('-')[1];
        return await fetchFromTMDB(`/discover/${type}?with_companies=${companyId}&page=${page}`);
    }
    if (payload.startsWith('network-')) {
        const networkId = payload.split('-')[1];
        return await fetchFromTMDB(`/discover/${type}?with_networks=${networkId}&page=${page}`);
    }
    return await fetchFromTMDB(`/discover/${type}?with_genres=${payload}&page=${page}`);
}

export async function fetchTVSeasons(tvId) {
    try {
        const res = await fetch(`${BASE_URL}/tv/${tvId}?api_key=${TMDB_API_KEY}`);
        const data = await res.json();
        return data.seasons || [];
    } catch (e) {
        console.error("TMDB Season Fetch Error:", e);
        return [];
    }
}
