export const KIDS_MOVIE_RATINGS = Object.freeze(['G', 'PG']);
export const KIDS_TV_RATINGS = Object.freeze(['TV-Y', 'TV-Y7', 'TV-Y7-FV', 'TV-G']);

const ALLOWED_RATINGS = Object.freeze({
    movie: new Set(KIDS_MOVIE_RATINGS),
    tv: new Set(KIDS_TV_RATINGS)
});

export function normalizeUsRating(value) {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replaceAll('_', '-')
        .replace(/\s+/g, '-');
}

export function resolveMediaType(item, fallbackType = '') {
    const candidate = String(item?.media_type || item?.type || fallbackType || '').toLowerCase();
    if (candidate === 'movie' || candidate === 'tv') return candidate;
    return '';
}

export function getEmbeddedUsRatings(item) {
    const candidates = [
        item?.certification,
        item?.certificate,
        item?.content_rating,
        item?.contentRating,
        item?.maturityRating
    ];
    return [...new Set(candidates.map(normalizeUsRating).filter(Boolean))];
}

export function getUsRatingsFromPayload(payload, mediaType) {
    if (!payload || typeof payload !== 'object') return [];

    if (mediaType === 'movie') {
        const usRelease = (payload.results || []).find(entry => entry?.iso_3166_1 === 'US');
        return [...new Set((usRelease?.release_dates || [])
            .map(entry => normalizeUsRating(entry?.certification))
            .filter(Boolean))];
    }

    if (mediaType === 'tv') {
        const usRating = (payload.results || []).find(entry => entry?.iso_3166_1 === 'US');
        const normalized = normalizeUsRating(usRating?.rating);
        return normalized ? [normalized] : [];
    }

    return [];
}

export function areRatingsKidsSafe(mediaType, ratings) {
    const allowed = ALLOWED_RATINGS[mediaType];
    if (!allowed) return false;

    const normalized = [...new Set((Array.isArray(ratings) ? ratings : [ratings])
        .map(normalizeUsRating)
        .filter(Boolean))];

    // Fail closed: unrated titles and titles with any conflicting higher rating
    // never enter a Kids profile.
    return normalized.length > 0 && normalized.every(rating => allowed.has(rating));
}

export function hasKidsSafeCatalogShape(item, fallbackType = '') {
    return !!item
        && item.adult !== true
        && !!item.id
        && !!resolveMediaType(item, fallbackType);
}
