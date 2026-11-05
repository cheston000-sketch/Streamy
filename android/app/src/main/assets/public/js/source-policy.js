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
        // Disney's broadcast season 4 groups two catalog stories into each file.
        // The first two tested files confirmed this provider uses that ordering.
        const pairs = [
            'Voyage to Spider Island / Superhero Soak',
            "Giant-Sized Lizard / Rhino's Wild Bunch",
            'The Bots vs. Ock / The Battery Boost',
            'King Lizard / Go Rhino Go',
            'Campout Chaos / Panther Pod to the Rescue',
            'Two Teleporters Too Many / Dinos Are Forever',
            'The Lost Lair of Web-Beard / Captain Gobby',
            'Mixing Up Trouble / To Catch a Cat',
            'How to Catch a Caterpillar / A Jellyfish Tale',
            'Night of the Goblins / Bat Attitude',
            'Saving Spider Island / A Ribbiting Rescue',
            'A Squirrel Girl and Tippy Toe Pirate Adventure / Knight at the Museum',
            'The Greedy Goose / Playpen Pandemonium',
            'The Candlelight Christmas Walk / The Santa Trap',
            'The Treasure of Billie the Pirate / Big City, Little Land Shark',
            'A Helping Handful / Adventures Down the Drain',
            "Dolphin Rescue / Gobby's Trash Day Takeover",
            'Motorcycle Madness / Oops! I Shrank WEB-Quarters',
            'The Return of Web-Beard / Sandman vs Hydro-Man'
        ];
        const groupedSeries = p.id === 'vidfast' && String(tmdb) === '127635'
            && (type === 'tv' || type === 'show');
        const pairIndex = Math.floor((Number(episode) - 1) / 2);
        const pairedEpisode = groupedSeries && Number(season) === 4
            && Number.isInteger(Number(episode)) && Number(episode) > 0 && pairIndex < pairs.length;
        // Other seasons need their own numbering verification.
        if (groupedSeries && !pairedEpisode) return null;
        const tokens = {tmdb, imdb, season, episode: pairedEpisode ? pairIndex + 1 : episode};
        return {server:pairedEpisode ? p.name + ' (' + pairs[pairIndex] + ')' : p.name,
            pairedEpisode, pairedLastEpisode:pairedEpisode ? (pairIndex + 1) * 2 : 0,
            pairedSeasonEnd:pairedEpisode && pairIndex === pairs.length - 1,
            providerId:p.id, providerTier:p.id, registryPrimary:p.primary, type:'iframe',
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
        result.lastFailureAt = now;
        result.failures = (previous.failures || 0) + 1;
        result.consecutiveFailures = (previous.consecutiveFailures || 0) + 1;
        if (result.consecutiveFailures >= 2) result.cooldownUntil = now + 15 * 60 * 1000;
    } else if (status === 'success') {
        result.lastSuccessAt = now;
        result.successes = (previous.successes || 0) + 1;
        result.consecutiveFailures = 0;
        result.cooldownUntil = 0;
        result.startupMs = previous.startupMs ? previous.startupMs * 0.7 + startupMs * 0.3 : startupMs;
    } else if (status === 'buffering') result.bufferCount = (previous.bufferCount || 0) + 1;
    return result;
}

export function sourceHealthTier(health = {}, now = Date.now()) {
    const age = now - (health.lastUpdatedAt || 0);
    if (age < 0 || age >= 7 * 24 * 60 * 60 * 1000) return 'untested';
    if (health.cooldownUntil > now || (age < 24 * 60 * 60 * 1000
        && (health.lastStatus === 'failed' || health.consecutiveFailures > 0))) return 'failed';
    if (health.successes > 0 && !health.consecutiveFailures
        && (health.lastStatus === 'success' || health.lastStatus === 'buffering')) return 'working';
    return 'untested';
}

export function sourceHealthPenalty(health = {}, now = Date.now()) {
    const tier = sourceHealthTier(health, now);
    // Tier gaps exceed every format/provider preference: observed reliability wins.
    if (tier === 'untested') return 0;
    const successes = Math.max(0, Number(health.successes) || 0);
    const failures = Math.max(0, Number(health.failures) || 0);
    const failureRate = failures / Math.max(1, successes + failures);
    return (tier === 'failed' ? 2000 : -2000)
        + (health.cooldownUntil > now ? 2000 : 0)
        + failureRate * 200
        + Math.min(200, (health.consecutiveFailures || 0) * 40)
        + Math.min(60, (health.startupMs || 0) / 1000)
        + Math.min(100, (health.bufferCount || 0) / Math.max(1, successes) * 10)
        - Math.min(40, successes * 4);
}
