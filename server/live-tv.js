const IPTV_API_ROOT = 'https://iptv-org.github.io/api';
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export const CURATED_CHANNEL_IDS = [
    'ABCNewsLive.us',
    'CBSNews247.us',
    'LiveNOWfromFOX.us',
    'ScrippsNews.us',
    'ReutersTV.us',
    'CheddarNews.us',
    'BloombergTV.us',
    'AccuWeatherNOW.us',
    'CourtTV.us',
    'CBSSportsHQ.us',
    'NFLChannel.us',
    'MLB.us',
    'PGATour.us',
    'FuboSportsNetwork.us',
    'beINSPORTSXTRA.us',
    'Stadium.us',
    'WorldPokerTour.us',
    'StoriesbyAMC.us',
    'HallmarkMoviesMore.us',
    'FilmRiseClassicTV.us',
    'FilmRiseForensicFiles.us',
    'PBSNature.us',
    'XploreTV.us',
    'ThisOldHouse.us',
    'Tastemade.us',
    'bonappetit.us',
    'OutsideTV.us',
    'PBSKids.us',
    'KartoonChannel.us',
    'LegoChannel.us',
    'BabySharkTV.us',
    'FailArmy.us',
    'ThePetCollective.us',
    'VevoPop.us',
    'XITE90sThrowback.us'
];

const FEATURED_CHANNEL_IDS = new Set([
    'ABCNewsLive.us',
    'CBSNews247.us',
    'LiveNOWfromFOX.us',
    'ScrippsNews.us',
    'BloombergTV.us',
    'AccuWeatherNOW.us',
    'CBSSportsHQ.us',
    'NFLChannel.us',
    'StoriesbyAMC.us',
    'PBSNature.us',
    'PBSKids.us',
    'Tastemade.us'
]);

const CATEGORY_ORDER = [
    'featured',
    'news',
    'sports',
    'movies',
    'entertainment',
    'kids',
    'documentary',
    'lifestyle',
    'music'
];

const CATEGORY_LABELS = {
    featured: 'Featured',
    news: 'News & Weather',
    sports: 'Sports',
    movies: 'Movies',
    entertainment: 'Entertainment',
    kids: 'Kids',
    documentary: 'Docs & Learning',
    lifestyle: 'Lifestyle',
    music: 'Music'
};

function isHttpsUrl(value) {
    try {
        return new URL(String(value || '')).protocol === 'https:';
    } catch (error) {
        return false;
    }
}

function streamScore(stream) {
    const url = String(stream?.url || '');
    let hostname = '';
    try {
        hostname = new URL(url).hostname.toLowerCase();
    } catch (error) {
        return Number.NEGATIVE_INFINITY;
    }

    if (!url.toLowerCase().includes('.m3u8')) return Number.NEGATIVE_INFINITY;
    if (hostname === 'jmp2.uk') return Number.NEGATIVE_INFINITY;

    const quality = Number.parseInt(String(stream.quality || '').match(/\d{3,4}/)?.[0] || '0', 10);
    let score = 200 + Math.min(quality, 2160) / 10;
    if (/akamaized\.net$/.test(hostname)) score += 45;
    if (/amagi\.tv$/.test(hostname)) score += 40;
    if (/cloudfront\.net$/.test(hostname)) score += 35;
    if (/wurl\.tv$/.test(hostname) || /wurl\.com$/.test(hostname)) score += 30;
    if (/cbsnews\.com$/.test(hostname) || /bloomberg\.com$/.test(hostname) || /pbskids\.org$/.test(hostname)) score += 50;
    // Several "pb-*" packager feeds currently publish HEVC-only variants. Keep
    // them as fallbacks, but favor broadly supported H.264 feeds in web browsers.
    if (hostname.startsWith('pb-')) score -= 250;
    return score;
}

function normalizeStream(stream) {
    if (!stream || !isHttpsUrl(stream.url)) return null;
    if (stream.label || stream.referrer || stream.user_agent) return null;
    const score = streamScore(stream);
    if (!Number.isFinite(score)) return null;

    return {
        url: stream.url,
        quality: stream.quality || 'Auto',
        title: stream.title || '',
        score
    };
}

function chooseLogo(logos = []) {
    return logos
        .filter(logo => logo && isHttpsUrl(logo.url))
        .map(logo => {
            const tags = Array.isArray(logo.tags) ? logo.tags : [];
            let score = logo.in_use ? 100 : 0;
            if (tags.includes('horizontal')) score += 30;
            if (tags.includes('white')) score += 12;
            if (logo.format === 'SVG' || logo.format === 'PNG' || logo.format === 'WebP') score += 8;
            if (Number(logo.width) >= Number(logo.height)) score += 10;
            return { url: logo.url, score };
        })
        .sort((a, b) => b.score - a.score)[0]?.url || '';
}

function getCategoryGroup(categories = []) {
    const values = new Set(Array.isArray(categories) ? categories : []);
    if (values.has('news') || values.has('weather') || values.has('business') || values.has('legislative')) return 'news';
    if (values.has('sports')) return 'sports';
    if (values.has('movies') || values.has('classic')) return 'movies';
    if (values.has('kids') || values.has('animation')) return 'kids';
    if (values.has('documentary') || values.has('science') || values.has('education')) return 'documentary';
    if (values.has('cooking') || values.has('lifestyle') || values.has('travel') || values.has('outdoor') || values.has('auto')) return 'lifestyle';
    if (values.has('music')) return 'music';
    return 'entertainment';
}

function safeWebsite(value) {
    return isHttpsUrl(value) ? value : '';
}

export function buildLiveTvCatalog({ channels = [], streams = [], logos = [], blocklist = [] } = {}) {
    const allowedIds = new Set(CURATED_CHANNEL_IDS);
    const blockedIds = new Set(blocklist.map(entry => entry?.channel).filter(Boolean));
    const streamsByChannel = new Map();
    const logosByChannel = new Map();

    for (const rawStream of streams) {
        if (!allowedIds.has(rawStream?.channel) || blockedIds.has(rawStream.channel)) continue;
        const stream = normalizeStream(rawStream);
        if (!stream) continue;
        if (!streamsByChannel.has(rawStream.channel)) streamsByChannel.set(rawStream.channel, []);
        streamsByChannel.get(rawStream.channel).push(stream);
    }

    for (const logo of logos) {
        if (!allowedIds.has(logo?.channel)) continue;
        if (!logosByChannel.has(logo.channel)) logosByChannel.set(logo.channel, []);
        logosByChannel.get(logo.channel).push(logo);
    }

    const orderById = new Map(CURATED_CHANNEL_IDS.map((id, index) => [id, index]));
    const normalizedChannels = channels
        .filter(channel => (
            allowedIds.has(channel?.id)
            && channel.country === 'US'
            && !channel.is_nsfw
            && !channel.closed
            && !blockedIds.has(channel.id)
            && streamsByChannel.has(channel.id)
        ))
        .map(channel => {
            const channelStreams = streamsByChannel.get(channel.id)
                .sort((a, b) => b.score - a.score)
                .filter((stream, index, all) => all.findIndex(candidate => candidate.url === stream.url) === index)
                .slice(0, 4)
                .map(({ score, ...stream }) => stream);
            const category = getCategoryGroup(channel.categories);
            return {
                id: channel.id,
                name: channel.name,
                network: channel.network || '',
                category,
                categoryLabel: CATEGORY_LABELS[category],
                categories: Array.isArray(channel.categories) ? channel.categories : [],
                featured: FEATURED_CHANNEL_IDS.has(channel.id),
                logo: chooseLogo(logosByChannel.get(channel.id)),
                website: safeWebsite(channel.website),
                streams: channelStreams
            };
        })
        .sort((a, b) => orderById.get(a.id) - orderById.get(b.id));

    const counts = Object.fromEntries(CATEGORY_ORDER.map(category => [
        category,
        category === 'featured'
            ? normalizedChannels.filter(channel => channel.featured).length
            : normalizedChannels.filter(channel => channel.category === category).length
    ]));

    return {
        channels: normalizedChannels,
        categories: CATEGORY_ORDER
            .filter(category => counts[category] > 0)
            .map(category => ({ id: category, label: CATEGORY_LABELS[category], count: counts[category] })),
        source: 'IPTV-org public channel directory'
    };
}

async function fetchJson(fetchImpl, url, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(url, {
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'StreamOS-LiveTV/1.0'
            }
        });
        if (!response.ok) throw new Error(`Live TV directory returned ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Live TV directory returned an invalid payload');
        return data;
    } finally {
        clearTimeout(timeoutId);
    }
}

export function createLiveTvService({
    fetchImpl = fetch,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    now = () => Date.now()
} = {}) {
    let cachedCatalog = null;
    let cacheExpiresAt = 0;
    let refreshPromise = null;

    async function refreshCatalog() {
        const [channels, streams, logos, blocklist] = await Promise.all([
            fetchJson(fetchImpl, `${IPTV_API_ROOT}/channels.json`, requestTimeoutMs),
            fetchJson(fetchImpl, `${IPTV_API_ROOT}/streams.json`, requestTimeoutMs),
            fetchJson(fetchImpl, `${IPTV_API_ROOT}/logos.json`, requestTimeoutMs),
            fetchJson(fetchImpl, `${IPTV_API_ROOT}/blocklist.json`, requestTimeoutMs)
        ]);
        const catalog = buildLiveTvCatalog({ channels, streams, logos, blocklist });
        if (!catalog.channels.length) throw new Error('No compatible Live TV channels are currently available');

        cachedCatalog = {
            ...catalog,
            refreshedAt: new Date(now()).toISOString(),
            stale: false
        };
        cacheExpiresAt = now() + cacheTtlMs;
        return cachedCatalog;
    }

    async function getCatalog({ force = false } = {}) {
        if (!force && cachedCatalog && now() < cacheExpiresAt) return cachedCatalog;
        if (refreshPromise) return refreshPromise;

        refreshPromise = refreshCatalog()
            .catch(error => {
                if (!cachedCatalog) throw error;
                return {
                    ...cachedCatalog,
                    stale: true,
                    warning: 'Using the most recent channel guide while the directory refreshes.'
                };
            })
            .finally(() => {
                refreshPromise = null;
            });
        return refreshPromise;
    }

    return { getCatalog };
}
