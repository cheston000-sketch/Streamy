const TOKENS = new Set(['tmdb', 'imdb', 'season', 'episode']);
export const REGISTRY_CACHE_KEY = 'streamy_source_registry_v1';
export const REGISTRY_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function validateRegistry(value) {
    if (value?.schemaVersion !== 1 || !Number.isSafeInteger(value.version) || value.version < 1
        || !Array.isArray(value.providers) || value.providers.length > 40
        || !Array.isArray(value.disabledHosts) || value.disabledHosts.length > 100) throw new Error('Invalid source registry');
    const ids = new Set();
    const providers = value.providers.map(p => {
        if (!/^[a-z0-9-]{1,60}$/.test(p.id) || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80 || /[<>&"']/.test(p.name)
            || typeof p.enabled !== 'boolean' || typeof p.primary !== 'boolean') throw new Error('Invalid provider');
        ids.add(p.id);
        for (const template of [p.movie, p.tv]) {
            if (typeof template !== 'string' || template.length > 2000) throw new Error('Invalid template');
            const url = new URL(template.replace(/\{([^}]+)\}/g, (_, token) => {
                if (!TOKENS.has(token)) throw new Error('Unknown template token');
                return '1';
            }));
            if (url.protocol !== 'https:' || url.username || url.password || /[{}]/.test(template.replace(/\{(tmdb|imdb|season|episode)\}/g, ''))) throw new Error('Invalid provider URL');
            if (/[{}]/.test(template.split('/').slice(0, 3).join('/'))) throw new Error('Dynamic provider host');
        }
        return { id:p.id, name:p.name.trim(), enabled:p.enabled, primary:p.primary, movie:p.movie, tv:p.tv };
    });
    const disabledHosts = value.disabledHosts.map(host => {
        if (typeof host !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) throw new Error('Invalid disabled host');
        return host.toLowerCase();
    });
    return { schemaVersion:1, version:value.version, providers, disabledHosts };
}

export function registryAllows(link, registry) {
    if (!registry) return true;
    try {
        const host = new URL(link.url).hostname.toLowerCase();
        if (registry.disabledHosts.some(h => host === h || host.endsWith('.' + h))) return false;
        if (link.type !== 'iframe') return true;
        return registry.providers.some(p => p.enabled && [p.movie, p.tv].some(t => new URL(t).hostname === host));
    } catch { return false; }
}

export function registryLinks(registry, {tmdb, imdb = '', type, season = 1, episode = 1}) {
    if (!registry) return [];
    return registry.providers.filter(p => p.enabled).map(p => {
        const template = type === 'tv' || type === 'show' ? p.tv : p.movie;
        if (template.includes('{imdb}') && !imdb) return null;
        const tokens = {tmdb, imdb, season, episode};
        return {server:p.name, providerId:p.id, providerTier:p.id, registryPrimary:p.primary, type:'iframe',
            url:template.replace(/\{([^}]+)\}/g, (_, token) => encodeURIComponent(tokens[token]))};
    }).filter(link => link && registryAllows(link, registry));
}

export function cachedRegistry(storage, now = Date.now()) {
    try {
        const cache = JSON.parse(storage.getItem(REGISTRY_CACHE_KEY));
        if (!Number.isFinite(cache?.savedAt) || now < cache.savedAt || now - cache.savedAt > REGISTRY_MAX_AGE) return null;
        return validateRegistry(cache.registry);
    } catch { return null; }
}

export async function refreshRegistry({host, storage, fetcher = fetch, options = {}, signal}) {
    const cached = cachedRegistry(storage);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) return cached;
    signal?.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(abort, 4000);
    try {
        const response = await fetcher(host + '/api/source-registry', {...options, signal:controller.signal, cache:'no-store'});
        if (!response.ok) throw new Error('Registry unavailable');
        const raw = await response.text();
        if (raw.length > 100000) throw new Error('Registry too large');
        const registry = validateRegistry(JSON.parse(raw));
        if (cached && registry.version < cached.version) return cached;
        try { storage.setItem(REGISTRY_CACHE_KEY, JSON.stringify({savedAt:Date.now(), registry})); } catch {}
        return registry;
    } catch { return cached; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export function updateSourceHealth(previous = {}, status, now = Date.now(), startupMs = 0) {
    const result = {...previous, lastStatus:status, lastUpdatedAt:now};
    if (status === 'failed') {
        result.failures = (previous.failures || 0) + 1;
        result.consecutiveFailures = (previous.consecutiveFailures || 0) + 1;
        if (result.consecutiveFailures >= 2) result.cooldownUntil = now + 15 * 60 * 1000;
    } else if (status === 'success') {
        result.successes = (previous.successes || 0) + 1;
        result.consecutiveFailures = 0;
        result.cooldownUntil = 0;
        result.startupMs = previous.startupMs ? previous.startupMs * 0.7 + startupMs * 0.3 : startupMs;
    } else if (status === 'buffering') result.bufferCount = (previous.bufferCount || 0) + 1;
    return result;
}

export function sourceHealthPenalty(health = {}, now = Date.now()) {
    const recent = now - (health.lastUpdatedAt || 0) < 24 * 60 * 60 * 1000;
    if (!recent) return 0;
    return (health.cooldownUntil > now ? 10000 : 0)
        + Math.min(200, (health.consecutiveFailures || 0) * 60)
        + Math.min(25, (health.startupMs || 0) / 1000)
        + Math.min(30, (health.bufferCount || 0) * 3)
        - Math.min(15, (health.successes || 0) * 3);
}
