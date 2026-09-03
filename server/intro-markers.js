const DEFAULT_TIMEOUT_MS = 3500;
const POSITIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 2000;
const MAX_INTRO_END_MS = 20 * 60 * 1000;

const PROVIDERS = [
    {
        id: 'skipdb',
        buildUrl: ({ imdbId, season, episode, durationSeconds }) => {
            const url = new URL('https://api.skipdb.tv/api/segments');
            url.searchParams.set('imdb_id', imdbId);
            url.searchParams.set('season', season);
            url.searchParams.set('episode', episode);
            if (durationSeconds > 0) url.searchParams.set('duration', durationSeconds);
            return url;
        },
        readIntro: payload => payload?.segments?.intro || null,
        readRecap: payload => payload?.segments?.recap || null
    },
    {
        id: 'introdb',
        buildUrl: ({ imdbId, season, episode }) => {
            const url = new URL('https://api.introdb.app/segments');
            url.searchParams.set('imdb_id', imdbId);
            url.searchParams.set('season', season);
            url.searchParams.set('episode', episode);
            return url;
        },
        readIntro: payload => payload?.intro || null,
        readRecap: payload => payload?.recap || null
    }
];

export function normalizeIntroLookup({ imdbId, season, episode, durationSeconds = 0 } = {}) {
    const normalizedImdbId = String(imdbId || '').trim().toLowerCase();
    const normalizedSeason = Number.parseInt(season, 10);
    const normalizedEpisode = Number.parseInt(episode, 10);
    const normalizedDuration = Number(durationSeconds);

    if (!/^tt\d{5,12}$/.test(normalizedImdbId)) return null;
    if (!Number.isInteger(normalizedSeason) || normalizedSeason < 1 || normalizedSeason > 1000) return null;
    if (!Number.isInteger(normalizedEpisode) || normalizedEpisode < 1 || normalizedEpisode > 10000) return null;

    return {
        imdbId: normalizedImdbId,
        season: normalizedSeason,
        episode: normalizedEpisode,
        durationSeconds: Number.isFinite(normalizedDuration) && normalizedDuration > 0
            ? Math.round(normalizedDuration * 1000) / 1000
            : 0
    };
}

export function normalizeIntroCandidate(rawIntro, provider) {
    if (!rawIntro || typeof rawIntro !== 'object') return null;

    const startMs = Number(rawIntro.start_ms ?? rawIntro.startMs);
    const endMs = Number(rawIntro.end_ms ?? rawIntro.endMs);
    const confidenceValue = Number(rawIntro.confidence);
    const confidence = Number.isFinite(confidenceValue)
        ? Math.max(0, Math.min(1, confidenceValue))
        : 0.5;
    const match = String(rawIntro.match || 'reported').toLowerCase();

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    if (startMs < 0 || endMs <= startMs || endMs > MAX_INTRO_END_MS) return null;
    if (confidence < 0.5) return null;
    if (match === 'out-of-range') return null;

    return {
        startMs: Math.round(startMs),
        endMs: Math.round(endMs),
        confidence,
        match,
        provider,
        adjusted: rawIntro.adjusted === true
    };
}

export function chooseIntroMarker(candidates = []) {
    const matchScore = {
        exact: 30,
        shifted: 25,
        reported: 20,
        agnostic: 10
    };

    return candidates
        .filter(Boolean)
        .sort((left, right) => {
            const leftScore = (left.confidence * 100) + (matchScore[left.match] || 0);
            const rightScore = (right.confidence * 100) + (matchScore[right.match] || 0);
            if (rightScore !== leftScore) return rightScore - leftScore;
            if (left.provider !== right.provider) return left.provider === 'skipdb' ? -1 : 1;
            return left.endMs - right.endMs;
        })[0] || null;
}

async function fetchProvider(provider, lookup, fetchImpl, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetchImpl(provider.buildUrl(lookup), {
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'StreamOS intro marker resolver'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        return {
            introMarker: normalizeIntroCandidate(provider.readIntro(payload), provider.id),
            recapMarker: normalizeIntroCandidate(provider.readRecap(payload), provider.id)
        };
    } finally {
        clearTimeout(timeout);
    }
}

export function createIntroMarkerResolver({
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    now = () => Date.now(),
    logger = console
} = {}) {
    const cache = new Map();

    function getCacheKey(lookup) {
        const durationKey = lookup.durationSeconds > 0 ? Math.round(lookup.durationSeconds) : 0;
        return `${lookup.imdbId}:s${lookup.season}:e${lookup.episode}:d${durationKey}`;
    }

    function setCached(key, value) {
        if (cache.size >= MAX_CACHE_ENTRIES) {
            cache.delete(cache.keys().next().value);
        }
        cache.set(key, value);
    }

    return {
        async resolve(rawLookup) {
            const lookup = normalizeIntroLookup(rawLookup);
            if (!lookup) {
                return {
                    lookup: null,
                    marker: null,
                    recapMarker: null,
                    cached: false,
                    errors: ['Invalid episode lookup']
                };
            }

            const cacheKey = getCacheKey(lookup);
            const cachedValue = cache.get(cacheKey);
            if (cachedValue && cachedValue.expiresAt > now()) {
                return { ...cachedValue.result, cached: true };
            }
            if (cachedValue) cache.delete(cacheKey);

            const settled = await Promise.allSettled(
                PROVIDERS.map(provider => fetchProvider(provider, lookup, fetchImpl, timeoutMs))
            );
            const introCandidates = [];
            const recapCandidates = [];
            const errors = [];

            settled.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    if (result.value.introMarker) introCandidates.push(result.value.introMarker);
                    if (result.value.recapMarker) recapCandidates.push(result.value.recapMarker);
                    return;
                }
                const reason = result.reason?.name === 'AbortError'
                    ? 'timed out'
                    : (result.reason?.message || 'request failed');
                errors.push(`${PROVIDERS[index].id}: ${reason}`);
            });

            const marker = chooseIntroMarker(introCandidates);
            const recapMarker = chooseIntroMarker(recapCandidates);
            const result = { lookup, marker, recapMarker, cached: false, errors };
            setCached(cacheKey, {
                expiresAt: now() + (marker || recapMarker ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
                result
            });

            if (errors.length && logger?.warn) {
                logger.warn(`[IntroMarkers] ${lookup.imdbId} S${lookup.season}E${lookup.episode}: ${errors.join(' | ')}`);
            }
            return result;
        },

        clear() {
            cache.clear();
        }
    };
}
