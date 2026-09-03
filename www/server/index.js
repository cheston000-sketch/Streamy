import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeProviders, makeStandardFetcher, targets } from '@movie-web/providers';
import { createIntroMarkerResolver } from './intro-markers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_VERSION = (() => {
    try {
        return JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')).version || '0.0.0';
    } catch (error) {
        console.warn('[Startup] Unable to read package version:', error.message);
        return '0.0.0';
    }
})();
const APP_BUILD = Number.parseInt(APP_VERSION, 10) || 0;
const introMarkerResolver = createIntroMarkerResolver();

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Ghost Thread] Blocked rogue unhandled rejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Ghost Thread] Blocked fatal crash:', err.message);
});

app.disable('x-powered-by');
app.use(cors());
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

const PRIVATE_STATIC_PATHS = [
    /^\/server(?:\/|$)/i,
    /^\/package(?:-lock)?\.json$/i,
    /^\/render\.ya?ml$/i,
    /^\/(?:err|logs)\.txt$/i
];

app.use((req, res, next) => {
    if (PRIVATE_STATIC_PATHS.some(pattern => pattern.test(req.path))) {
        return res.sendStatus(404);
    }
    next();
});
app.use(express.static(APP_ROOT, { dotfiles: 'deny' }));

const providers = makeProviders({
    fetcher: makeStandardFetcher(fetch),
    target: targets.ANY
});
const ENABLE_BUILT_IN_PROVIDERS = String(process.env.ENABLE_BUILT_IN_PROVIDERS || 'true').toLowerCase() !== 'false';
const BUILT_IN_PROVIDER_TIMEOUT_MS = Math.max(500, Number(process.env.BUILT_IN_PROVIDER_TIMEOUT_MS) || 12000);

function parseEndpointList(raw = '') {
    return String(raw || '')
        .split(/[\n,]+/)
        .map(endpoint => endpoint.trim())
        .filter(Boolean);
}

function parseProviderRegistry(raw = '') {
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        const providersConfig = Array.isArray(parsed) ? parsed : parsed.providers;
        if (!Array.isArray(providersConfig)) return [];

        return providersConfig
            .map((provider, index) => {
                const label = provider.label || provider.name || `Custom Provider ${index + 1}`;
                const tier = provider.tier || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
                const endpoints = Array.isArray(provider.endpoints)
                    ? provider.endpoints.map(endpoint => String(endpoint || '').trim()).filter(Boolean)
                    : parseEndpointList(provider.endpoint || provider.url || '');
                return { label, tier, endpoints };
            })
            .filter(provider => provider.endpoints.length);
    } catch (error) {
        console.warn('[ProviderRegistry] Invalid SOURCE_PROVIDER_CONFIG JSON:', error.message);
        return [];
    }
}

const DIRECT_SOURCE_ENDPOINTS = parseEndpointList(process.env.DIRECT_SOURCE_ENDPOINTS || '');
const SFX_SOURCE_ENDPOINTS = parseEndpointList(process.env.SFX_SOURCE_ENDPOINTS || process.env.SFX_PROVIDER_ENDPOINTS || '');
const STREAMEX_SOURCE_ENDPOINTS = parseEndpointList(process.env.STREAMEX_SOURCE_ENDPOINTS || process.env.STREAMEX_PROVIDER_ENDPOINTS || '');
const CINEMAOS_SOURCE_ENDPOINTS = parseEndpointList(process.env.CINEMAOS_SOURCE_ENDPOINTS || process.env.CINEMAOS_PROVIDER_ENDPOINTS || '');
const VID2_SOURCE_ENDPOINTS = parseEndpointList(process.env.VID2_SOURCE_ENDPOINTS || process.env.VID2_PROVIDER_ENDPOINTS || '');
const VIDEASY_SOURCE_ENDPOINTS = parseEndpointList(process.env.VIDEASY_SOURCE_ENDPOINTS || process.env.VIDEASY_PROVIDER_ENDPOINTS || '');
const VIDPRO_SOURCE_ENDPOINTS = parseEndpointList(process.env.VIDPRO_SOURCE_ENDPOINTS || process.env.VIDPRO_PROVIDER_ENDPOINTS || '');
const STREMIO_ADDON_URLS = parseEndpointList(process.env.STREMIO_ADDON_URLS || process.env.STREAMOS_STREMIO_ADDONS || '');
const ENABLE_BEE_COMPAT_SOURCES = String(process.env.ENABLE_BEE_COMPAT_SOURCES || 'true').toLowerCase() !== 'false';
const BEE_COMPAT_SOURCE_ENDPOINTS = ENABLE_BEE_COMPAT_SOURCES ? [
    'https://cinemaos.live/api/cinemaos?type={type}&tmdbId={tmdb}',
    'https://tom.autoembed.cc/api/getVideoSource?type={type}&id={tmdb}',
    'https://vidrock.net/api/{type}/{tmdb}',
    'https://moviesapi.club/{type}/{tmdb}',
    'https://fsapi.xyz/{type}/{tmdb}',
    'https://fsapi.xyz/{type}/{imdb}',
    'https://vidsrc.cc/api/source/{tmdb}',
    'https://vidsrc.cc/api/source/{imdb}',
    'https://embed.su/api/e/{tmdb}',
    'https://player.voxzer.org/list/{tmdb}',
    'https://api.whvx.net/source?resourceId=tmdb:{tmdb}',
    'https://primesrc.me/api/v1/s?type={type}&tmdb={tmdb}',
    'https://primesrc.me/api/v1/s?type={type}&imdb={imdb}'
] : [];
const CUSTOM_SOURCE_PROVIDER_GROUPS = parseProviderRegistry(process.env.SOURCE_PROVIDER_CONFIG || process.env.STREAMOS_SOURCE_PROVIDERS || '');
const SOURCE_ENDPOINT_GROUPS = [
    { label: 'Direct Provider', tier: 'configured', endpoints: DIRECT_SOURCE_ENDPOINTS },
    { label: 'Bee-Compatible API Presets', tier: 'bee-compat', endpoints: BEE_COMPAT_SOURCE_ENDPOINTS },
    { label: 'SFX Provider', tier: 'sfx', endpoints: SFX_SOURCE_ENDPOINTS },
    { label: 'StreameX Provider', tier: 'streamex', endpoints: STREAMEX_SOURCE_ENDPOINTS },
    { label: 'CinemaOS Provider', tier: 'cinemaos', endpoints: CINEMAOS_SOURCE_ENDPOINTS },
    { label: 'Vid2 Provider', tier: 'vid2', endpoints: VID2_SOURCE_ENDPOINTS },
    { label: 'Videasy Provider', tier: 'videasy', endpoints: VIDEASY_SOURCE_ENDPOINTS },
    { label: 'VidPro Provider', tier: 'vidpro', endpoints: VIDPRO_SOURCE_ENDPOINTS },
    ...CUSTOM_SOURCE_PROVIDER_GROUPS
].filter(group => group.endpoints.length);

const STREMIO_ADDONS = STREMIO_ADDON_URLS.map((url, index) => {
    const baseUrl = String(url || '').trim().replace(/\/manifest\.json$/i, '').replace(/\/$/, '');
    return {
        label: providerNameFromEndpoint(baseUrl) || `Stremio Addon ${index + 1}`,
        baseUrl
    };
}).filter(addon => addon.baseUrl.startsWith('http'));

function fillTemplate(template, params) {
    const normalizedType = params.type === 'tv' || params.type === 'show' ? 'tv' : 'movie';
    return template.replace(/\{(tmdb|imdb|type|title|year|season|episode)\}/g, (_, key) => {
        const value = params[key] ?? '';
        if (key === 'type') return encodeURIComponent(normalizedType);
        return key === 'title' ? encodeURIComponent(value) : encodeURIComponent(String(value));
    });
}

function firstPresentString(source, keys = []) {
    if (!source || typeof source !== 'object') return '';
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
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

function providerNameFromEndpoint(endpoint) {
    try {
        return new URL(endpoint).hostname.replace(/^www\./, '');
    } catch (error) {
        return 'Direct Provider';
    }
}

function normalizeDirectProviderLink(rawLink, providerName = 'Direct Provider', providerTier = 'configured') {
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
        'download',
        'source',
        'sourceUrl',
        'source_url',
        'link',
        'linkUrl',
        'video',
        'videoUrl'
    ]);
    if (!url || typeof url !== 'string') return null;

    const headers = link.headers || link.requestHeaders || link.request_headers || {};
    const type = inferDirectStreamType(url, link.type || link.mimeType || link.mime || link.format || '');
    if (!type || type === 'iframe') return null;

    const label = link.quality || link.label || link.resolution || link.size || (link.height ? `${link.height}p` : '');

    return {
        server: link.server || link.provider || link.host || link.name || providerName,
        url,
        type,
        quality: label,
        referer: link.referer || link.referrer || headers.Referer || headers.referer || '',
        origin: link.origin || headers.Origin || headers.origin || '',
        cookie: link.cookie || headers.Cookie || headers.cookie || '',
        providerTier,
        direct: true
    };
}

function normalizeDirectProviderPayload(payload, providerName = 'Direct Provider', providerTier = 'configured') {
    const links = [];
    const seen = new Set();

    const addLink = (raw, inheritedProvider = providerName, depth = 0) => {
        if (!raw || depth > 5) return;

        if (typeof raw === 'string') {
            const direct = normalizeDirectProviderLink(raw, inheritedProvider, providerTier);
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
        const direct = normalizeDirectProviderLink(raw, localProvider, providerTier);
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

        ['links', 'streams', 'sources', 'items', 'results', 'data', 'result', 'payload', 'qualities', 'files', 'videos', 'source'].forEach(key => {
            if (raw[key]) addLink(raw[key], localProvider, depth + 1);
        });
    };

    addLink(payload, providerName);
    return links;
}

function getQualityFromText(...values) {
    const source = values.filter(Boolean).join(' ').toLowerCase();
    if (source.includes('2160') || source.includes('4k')) return '4K';
    if (source.includes('1080')) return '1080p';
    if (source.includes('720')) return '720p';
    if (source.includes('480')) return '480p';
    return '';
}

function normalizeStremioStreams(payload, providerName = 'Stremio Addon') {
    const streams = Array.isArray(payload?.streams) ? payload.streams : [];
    return streams
        .map(stream => {
            const url = firstPresentString(stream, ['url', 'file', 'src', 'hls', 'playlistUrl', 'playlist']);
            if (!url) return null;
            const type = inferDirectStreamType(url, stream.type || stream.mimeType || stream.mime || '');
            if (!type || type === 'iframe') return null;

            const proxyHeaders = stream.behaviorHints?.proxyHeaders || {};
            const requestHeaders = stream.requestHeaders || stream.headers || {};
            const headers = { ...requestHeaders, ...proxyHeaders };

            return {
                server: stream.name || stream.title || providerName,
                url,
                type,
                quality: stream.quality || getQualityFromText(stream.name, stream.title, stream.description),
                referer: stream.referer || headers.Referer || headers.referer || '',
                origin: stream.origin || headers.Origin || headers.origin || '',
                cookie: stream.cookie || headers.Cookie || headers.cookie || '',
                providerTier: 'stremio',
                direct: true
            };
        })
        .filter(Boolean);
}

function getStremioIdCandidates(params) {
    const addonType = params.type === 'tv' || params.type === 'show' ? 'series' : 'movie';
    const baseIds = [
        params.imdb,
        params.imdbId,
        params.imdb_id,
        params.tmdb ? `tmdb:${params.tmdb}` : '',
        params.tmdb
    ].filter(Boolean);
    const ids = new Set();

    baseIds.forEach(id => {
        const normalizedId = String(id).trim();
        if (!normalizedId) return;
        if (addonType === 'series') {
            ids.add(`${normalizedId}:${params.season || 1}:${params.episode || 1}`);
        } else {
            ids.add(normalizedId);
        }
    });

    return { addonType, ids: [...ids] };
}

async function fetchStremioAddonLinks(params) {
    if (!STREMIO_ADDONS.length) return [];
    const { addonType, ids } = getStremioIdCandidates(params);
    if (!ids.length) return [];

    const links = [];
    for (const addon of STREMIO_ADDONS) {
        for (const id of ids) {
            const endpoint = `${addon.baseUrl}/stream/${encodeURIComponent(addonType)}/${encodeURIComponent(id)}.json`;
            let timeout;
            try {
                const controller = new AbortController();
                timeout = setTimeout(() => controller.abort(), 8000);
                const response = await fetch(endpoint, {
                    signal: controller.signal,
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'StreamOS/1.0 stremio-provider'
                    }
                });
                clearTimeout(timeout);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                links.push(...normalizeStremioStreams(await response.json(), addon.label));
            } catch (error) {
                console.warn(`[StremioProvider] Failed ${endpoint}:`, error.message);
            } finally {
                if (timeout) clearTimeout(timeout);
            }
        }
    }

    return links;
}

async function fetchDirectSourceLinks(params) {
    if (!SOURCE_ENDPOINT_GROUPS.length) return [];
    const jobs = SOURCE_ENDPOINT_GROUPS.flatMap(group => group.endpoints.map(endpointTemplate => ({ group, endpointTemplate })));
    const settled = await Promise.all(jobs.map(async ({ group, endpointTemplate }) => {
        const endpoint = fillTemplate(endpointTemplate, params);
        let timeout;
        try {
            const controller = new AbortController();
            timeout = setTimeout(() => controller.abort(), 4500);
            const response = await fetch(endpoint, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json, text/plain;q=0.9',
                    'User-Agent': 'StreamOS/1.0 direct-source-resolver'
                }
            });
            clearTimeout(timeout);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const contentType = response.headers.get('content-type') || '';
            const payload = contentType.includes('application/json')
                ? await response.json()
                : (await response.text()).split(/\r?\n/).filter(Boolean);
            const providerName = typeof payload === 'object' && payload?.provider
                ? payload.provider
                : providerNameFromEndpoint(endpoint) || group.label;
            return normalizeDirectProviderPayload(payload, providerName, group.tier);
        } catch (error) {
            console.warn(`[${group.label}] Failed ${endpoint}:`, error.message);
            return [];
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }));

    return settled.flat();
}

function normalizeMovieWebLinks(output) {
    if (!output?.stream) return [];

    const sourceName = output.sourceId || 'Built-in Provider';
    const streams = Array.isArray(output.stream) ? output.stream : [output.stream];
    const links = [];

    streams.forEach(stream => {
        if (!stream) return;
        if (stream.url) links.push({ server: sourceName, url: stream.url, type: 'mp4' });
        if (stream.playlistUrl) links.push({ server: `${sourceName} (Auto)`, url: stream.playlistUrl, type: 'hls' });
        if (stream.playlist) links.push({ server: `${sourceName} (Auto)`, url: stream.playlist, type: 'hls' });

        if (stream.qualities && typeof stream.qualities === 'object') {
            Object.entries(stream.qualities).forEach(([quality, value]) => {
                if (value?.url) {
                    links.push({ server: `${sourceName} - ${quality}`, url: value.url, type: 'mp4' });
                }
            });
        }
    });

    return links;
}

async function fetchBuiltInProviderLinks(media) {
    if (!ENABLE_BUILT_IN_PROVIDERS) return [];

    let timeoutId;
    try {
        const output = await Promise.race([
            providers.runAll({ media }),
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Built-in provider timeout')), BUILT_IN_PROVIDER_TIMEOUT_MS);
            })
        ]);
        return normalizeMovieWebLinks(output);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

function buildFallbackLinks({ tmdb, type, season = 1, episode = 1 }, includeExtras = true) {
    const isTv = type === 'tv' || type === 'show';
    const links = [{
        server: 'Vidlink',
        url: isTv
            ? `https://vidlink.pro/tv/${tmdb}/${season}/${episode}?primaryColor=6366f1&secondaryColor=a5b4fc&iconColor=ffffff&icons=fontawesome&player=v2&autoplay=true&volume=1.0&muted=0`
            : `https://vidlink.pro/movie/${tmdb}?primaryColor=6366f1&secondaryColor=a5b4fc&iconColor=ffffff&icons=fontawesome&player=v2&autoplay=true&volume=1.0&muted=0`,
        type: 'iframe'
    }];

    if (!includeExtras) return links;

    links.push(
        {
            server: 'Vidsrc.me',
            url: isTv
                ? `https://vidsrc.me/embed/tv?tmdb=${tmdb}&season=${season}&episode=${episode}`
                : `https://vidsrc.me/embed/movie?tmdb=${tmdb}`,
            type: 'iframe'
        },
        {
            server: 'Vidsrc.net',
            url: isTv
                ? `https://vidsrc.net/embed/tv?tmdb=${tmdb}&season=${season}&episode=${episode}`
                : `https://vidsrc.net/embed/movie?tmdb=${tmdb}`,
            type: 'iframe'
        },
        {
            server: 'MultiEmbed',
            url: isTv
                ? `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1&s=${season}&e=${episode}`
                : `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1`,
            type: 'iframe'
        }
    );

    return links;
}

function dedupeLinks(links = []) {
    const seen = new Set();
    return links.filter(link => {
        if (!link?.url || seen.has(link.url)) return false;
        seen.add(link.url);
        return true;
    });
}

function buildProviderStatus(directLinkCount, warnings = [], elapsedMs = 0) {
    return {
        backendVersion: APP_VERSION,
        backendBuild: APP_BUILD,
        configuredProviderCount: SOURCE_ENDPOINT_GROUPS.length,
        beeCompatEnabled: ENABLE_BEE_COMPAT_SOURCES,
        builtInProvidersEnabled: ENABLE_BUILT_IN_PROVIDERS,
        stremioAddonCount: STREMIO_ADDONS.length,
        directLinkCount,
        fallbackOnly: directLinkCount === 0,
        degraded: warnings.length > 0 || directLinkCount === 0,
        warnings: warnings.slice(0, 5),
        elapsedMs,
        message: directLinkCount > 0
            ? `Found ${directLinkCount} direct/provider link${directLinkCount === 1 ? '' : 's'}.`
            : 'Direct providers were unavailable; backup web-player sources are ready.'
    };
}

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: APP_VERSION,
        build: APP_BUILD,
        providerApi: true,
        introMarkers: true,
        uptimeSeconds: Math.floor(process.uptime())
    });
});

app.get('/api/providers', (req, res) => {
    res.json({
        backendVersion: APP_VERSION,
        backendBuild: APP_BUILD,
        configuredProviderCount: SOURCE_ENDPOINT_GROUPS.length,
        beeCompatEnabled: ENABLE_BEE_COMPAT_SOURCES,
        builtInProvidersEnabled: ENABLE_BUILT_IN_PROVIDERS,
        stremioAddonCount: STREMIO_ADDONS.length,
        providers: SOURCE_ENDPOINT_GROUPS.map(group => ({
            label: group.label,
            tier: group.tier,
            endpointCount: group.endpoints.length
        })),
        stremioAddons: STREMIO_ADDONS.map(addon => ({
            label: addon.label,
            baseUrl: addon.baseUrl
        }))
    });
});

app.get('/api/segments', async (req, res) => {
    const result = await introMarkerResolver.resolve({
        imdbId: req.query.imdb || req.query.imdb_id,
        season: req.query.season,
        episode: req.query.episode,
        durationSeconds: req.query.duration
    });

    if (!result.lookup) {
        return res.status(400).json({
            success: false,
            error: 'A valid IMDb ID, season, and episode are required',
            introMarker: null,
            recapMarker: null
        });
    }

    return res.json({
        success: true,
        imdbId: result.lookup.imdbId,
        season: result.lookup.season,
        episode: result.lookup.episode,
        introMarker: result.marker,
        recapMarker: result.recapMarker,
        cached: result.cached,
        degraded: result.errors.length > 0
    });
});

app.get('/api/stream', async (req, res) => {
    const { tmdb, imdb, type, title, year, season, episode } = req.query;

    if (!tmdb) {
        return res.status(400).json({ error: 'Missing tmdb parameter', links: [] });
    }

    const startedAt = Date.now();
    const normalizedType = type === 'tv' || type === 'show' ? 'tv' : 'movie';
    const normalizedSeason = Math.max(1, Number(season) || 1);
    const normalizedEpisode = Math.max(1, Number(episode) || 1);
    const mediaTitle = String(title || `TMDB ${tmdb}`);
    const releaseYear = Number(year) || 0;
    const params = {
        tmdb,
        imdb,
        type: normalizedType,
        title: mediaTitle,
        year: releaseYear,
        season: normalizedSeason,
        episode: normalizedEpisode
    };
    const media = normalizedType === 'tv'
        ? {
            type: 'show',
            title: mediaTitle,
            releaseYear,
            tmdbId: tmdb,
            season: { number: normalizedSeason },
            episode: { number: normalizedEpisode }
        }
        : { type: 'movie', title: mediaTitle, releaseYear, tmdbId: tmdb };
    const warnings = [];

    try {
        console.log(`[Extractor] Resolving streams for: ${mediaTitle} (${releaseYear || 'year unknown'})`);
        const [directLinks, stremioLinks, builtInLinks, introMarkerResult] = await Promise.all([
            fetchDirectSourceLinks(params).catch(error => {
                warnings.push(`Direct providers: ${error.message}`);
                console.warn('[Extractor] Direct providers failed:', error.message);
                return [];
            }),
            fetchStremioAddonLinks(params).catch(error => {
                warnings.push(`Stremio providers: ${error.message}`);
                console.warn('[Extractor] Stremio providers failed:', error.message);
                return [];
            }),
            fetchBuiltInProviderLinks(media).catch(error => {
                warnings.push(`Built-in providers: ${error.message}`);
                console.warn('[Extractor] Built-in providers failed:', error.message);
                return [];
            }),
            normalizedType === 'tv' && imdb
                ? introMarkerResolver.resolve({
                    imdbId: imdb,
                    season: normalizedSeason,
                    episode: normalizedEpisode
                })
                : Promise.resolve({ marker: null })
        ]);

        let finalLinks = dedupeLinks([...directLinks, ...stremioLinks, ...builtInLinks]);
        const hasDirectLinks = finalLinks.some(link => link.type !== 'iframe');
        finalLinks = dedupeLinks([
            ...finalLinks,
            ...buildFallbackLinks(params, !hasDirectLinks)
        ]);

        const directLinkCount = finalLinks.filter(link => link.type !== 'iframe').length;
        const providerStatus = buildProviderStatus(directLinkCount, warnings, Date.now() - startedAt);
        console.log(`[Extractor] Ready: ${finalLinks.length} sources (${directLinkCount} direct) in ${providerStatus.elapsedMs}ms.`);
        return res.json({
            success: true,
            links: finalLinks,
            introMarker: introMarkerResult.marker,
            recapMarker: introMarkerResult.recapMarker,
            providerStatus
        });
    } catch (error) {
        console.error('[Extractor] Runtime degraded to fallback:', error.message);
        warnings.push(`Runtime: ${error.message}`);
        const links = buildFallbackLinks(params, true);
        return res.json({
            success: true,
            links,
            introMarker: null,
            recapMarker: null,
            providerStatus: buildProviderStatus(0, warnings, Date.now() - startedAt)
        });
    }
});

// ==========================================
// MUSIC PROXIES (Streamex & Deezer)
// ==========================================
app.use('/api/streamex', async (req, res) => {
    const streamexPath = req.url.replace(/^\//, '');
    const targetUrl = `https://streamex.sh/api/music/${streamexPath}`;
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://streamex.sh/music',
                'Accept': 'application/json'
            }
        });
        clearTimeout(timeout);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(error.name === 'AbortError' ? 504 : 500).json({ error: error.message });
    }
});

app.use('/api/deezer', async (req, res) => {
    const deezerPath = req.url.replace(/^\//, '');
    const targetUrl = `https://api.deezer.com/${deezerPath}`;
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://www.deezer.com',
                'Referer': 'https://www.deezer.com/'
            }
        });
        clearTimeout(timeout);
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
            const data = await response.json();
            res.json(data);
        } else {
            const text = await response.text();
            console.error("[Deezer Proxy Error] Expected JSON, got HTML. Render node blocked by Deezer? Snippet:", text.substring(0, 100));
            res.status(502).json({ error: "Upstream Deezer format invalid", raw_snippet: text.substring(0, 100) });
        }
    } catch (error) {
        res.status(error.name === 'AbortError' ? 504 : 500).json({ error: error.message });
    }
});

// Saavn Proxy (Fallback Provider)
app.use('/api/saavn', async (req, res) => {
    const saavnPath = req.url?.replace(/^\//, '');
    const targetUrl = `https://saavn.sumit.co/api/${saavnPath}`;
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timeout);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(error.name === 'AbortError' ? 504 : 500).json({ error: error.message });
    }
});

// ==========================================
// OTA UPDATE SERVER (For StreamOS)
// ==========================================
const OTA_DIR = path.join(__dirname, '..');

function getLatestOtaApk() {
    const candidates = fs.readdirSync(OTA_DIR)
        .map(fileName => {
            const match = fileName.match(/^StreamOS(?:_v(\d+))?\.apk$/i);
            if (!match) return null;
            const version = match[1] ? Number(match[1]) : 0;
            const fullPath = path.join(OTA_DIR, fileName);
            return { fileName, fullPath, version, mtimeMs: fs.statSync(fullPath).mtimeMs };
        })
        .filter(Boolean)
        .sort((a, b) => (b.version - a.version) || (b.mtimeMs - a.mtimeMs));

    return candidates[0] || null;
}

app.get('/api/ota', (req, res) => {
    const latest = getLatestOtaApk();
    if (!latest) {
        return res.status(404).json({ available: false, version: 0, error: 'No OTA APK staged' });
    }

    res.json({
        available: true,
        version: latest.version,
        url: '/api/ota/download',
        download: '/api/ota/download',
        file: latest.fileName
    });
});

app.get('/api/ota/download', (req, res) => {
    const latest = getLatestOtaApk();
    if (!latest) {
        return res.status(404).send("APK sequence entirely absent from Cloud Node.");
    }

    res.download(latest.fullPath, latest.fileName);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 StreamOS Full-Stack Server Running!`);
    console.log(`📂 App URI: http://localhost:${PORT}`);
    console.log(`📡 API URI: http://localhost:${PORT}/api/stream\n`);
});
