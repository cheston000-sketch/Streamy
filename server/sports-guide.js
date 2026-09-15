const ESPN_API_ROOT = 'https://site.api.espn.com/apis/site/v2/sports';
const DEFAULT_CACHE_TTL_MS = 90_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_BATCH_DELAY_MS = 1_000;
const DEFAULT_DAYS_BACK = 1;
const DEFAULT_DAYS_FORWARD = 14;

export const SPORTS_LEAGUES = Object.freeze([
    { id: 'nfl', label: 'NFL', sport: 'football', league: 'nfl', group: 'football' },
    { id: 'college-football', label: 'College Football', sport: 'football', league: 'college-football', group: 'football' },
    { id: 'nba', label: 'NBA', sport: 'basketball', league: 'nba', group: 'basketball' },
    { id: 'wnba', label: 'WNBA', sport: 'basketball', league: 'wnba', group: 'basketball' },
    { id: 'ncaam', label: "NCAA Men's Basketball", sport: 'basketball', league: 'mens-college-basketball', group: 'basketball' },
    { id: 'ncaaw', label: "NCAA Women's Basketball", sport: 'basketball', league: 'womens-college-basketball', group: 'basketball' },
    { id: 'mlb', label: 'MLB', sport: 'baseball', league: 'mlb', group: 'baseball' },
    { id: 'nhl', label: 'NHL', sport: 'hockey', league: 'nhl', group: 'hockey' },
    { id: 'mls', label: 'MLS', sport: 'soccer', league: 'usa.1', group: 'soccer' },
    { id: 'nwsl', label: 'NWSL', sport: 'soccer', league: 'usa.nwsl', group: 'soccer' },
    { id: 'premier-league', label: 'Premier League', sport: 'soccer', league: 'eng.1', group: 'soccer' },
    { id: 'champions-league', label: 'Champions League', sport: 'soccer', league: 'uefa.champions', group: 'soccer' },
    { id: 'europa-league', label: 'Europa League', sport: 'soccer', league: 'uefa.europa', group: 'soccer' },
    { id: 'liga-mx', label: 'Liga MX', sport: 'soccer', league: 'mex.1', group: 'soccer' },
    { id: 'la-liga', label: 'La Liga', sport: 'soccer', league: 'esp.1', group: 'soccer' },
    { id: 'bundesliga', label: 'Bundesliga', sport: 'soccer', league: 'ger.1', group: 'soccer' },
    { id: 'serie-a', label: 'Serie A', sport: 'soccer', league: 'ita.1', group: 'soccer' },
    { id: 'ligue-1', label: 'Ligue 1', sport: 'soccer', league: 'fra.1', group: 'soccer' },
    { id: 'ufc', label: 'UFC', sport: 'mma', league: 'ufc', group: 'combat' },
    { id: 'pga', label: 'PGA Tour', sport: 'golf', league: 'pga', group: 'golf' },
    { id: 'lpga', label: 'LPGA Tour', sport: 'golf', league: 'lpga', group: 'golf' },
    { id: 'f1', label: 'Formula 1', sport: 'racing', league: 'f1', group: 'racing' },
    { id: 'nascar', label: 'NASCAR Cup', sport: 'racing', league: 'nascar-premier', group: 'racing' },
    { id: 'atp', label: 'ATP Tennis', sport: 'tennis', league: 'atp', group: 'tennis' },
    { id: 'wta', label: 'WTA Tennis', sport: 'tennis', league: 'wta', group: 'tennis' },
    { id: 'pll', label: 'Premier Lacrosse', sport: 'lacrosse', league: 'pll', group: 'lacrosse', currentOnly: true },
    { id: 'nll', label: 'National Lacrosse', sport: 'lacrosse', league: 'nll', group: 'lacrosse', currentOnly: true }
]);

const CHANNEL_IDS_BY_BROADCAST = new Map([
    ['cbs sports golazo network', ['CBSSportsGolazoNetwork.us']],
    ['cbs sports hq', ['CBSSportsHQ.us']],
    ['nbc sports now', ['NBCSportsNOW.us']],
    ['nhl network', ['NHLNetwork.us']],
    ['tennis channel', ['TennisChannel.us']],
    ['fifa plus', ['FIFAPlus.uk']],
    ['fifa plus women', ['FIFAPlusWomen.uk']],
    ['bein sports xtra', ['beINSPORTSXTRA.us']],
    ['pga tour', ['PGATour.us']],
    ['womens sports network', ['WomensSportsNetwork.us']],
    ['fight network', ['FightNetwork.ca']],
    ['fite 24 7', ['FITE247.us']],
    ['draftkings network', ['DraftKingsNetwork.us']],
    ['sportsgrid', ['SportsGrid.us']],
    ['lacrosse tv', ['LacrosseTV.us']]
]);

const OFFICIAL_PROVIDER_RULES = [
    { match: value => value.startsWith('espn'), name: 'ESPN', url: 'https://www.espn.com/watch/' },
    { match: value => value === 'abc', name: 'ABC', url: 'https://abc.com/watch-live' },
    { match: value => value === 'cbs', name: 'CBS', url: 'https://www.cbs.com/live-tv/' },
    { match: value => /^(?:cbssn|cbs sports network|paramount plus)$/.test(value), name: 'Paramount+', url: 'https://www.paramountplus.com/sports/' },
    { match: value => /^(?:fox|fs1|fs2|fox deportes|btn)$/.test(value), name: 'FOX Sports', url: 'https://www.foxsports.com/live' },
    { match: value => /^(?:nbc|nbcsn|usa net|usa network|peacock|golf chnl|golf channel)/.test(value), name: 'Peacock', url: 'https://www.peacocktv.com/sports' },
    { match: value => value === 'prime video', name: 'Prime Video', url: 'https://www.amazon.com/gp/video/sports' },
    { match: value => value === 'apple tv', name: 'Apple TV', url: 'https://tv.apple.com/us/channel/mls-season-pass/tvs.sbd.7000' },
    { match: value => /^(?:tnt|tbs|trutv|tru tv|max)$/.test(value), name: 'Max Sports', url: 'https://play.max.com/sports' },
    { match: value => /^(?:nba tv|nba league pass)$/.test(value), name: 'NBA League Pass', url: 'https://www.nba.com/watch/league-pass-stream' },
    { match: value => value === 'wnba league pass', name: 'WNBA League Pass', url: 'https://www.wnba.com/leaguepass' },
    { match: value => value === 'nhl network', name: 'NHL', url: 'https://www.nhl.com/where-to-stream' },
    { match: value => value === 'tennis channel', name: 'Tennis Channel', url: 'https://www.tennischannel.com/watch' },
    { match: value => value.startsWith('bein sports'), name: 'beIN Sports', url: 'https://www.beinsports.com/en-us' },
    { match: value => value.startsWith('fifa plus'), name: 'FIFA+', url: 'https://www.plus.fifa.com/' },
    { match: value => value === 'f1 tv', name: 'F1 TV', url: 'https://f1tv.formula1.com/' }
];

function isHttpsUrl(value) {
    try {
        return new URL(String(value || '')).protocol === 'https:';
    } catch (error) {
        return false;
    }
}

function uniqueStrings(values = []) {
    const seen = new Set();
    return values
        .map(value => String(value || '').trim())
        .filter(value => {
            const key = value.toLowerCase();
            if (!value || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

export function normalizeNetworkName(value = '') {
    return String(value)
        .toLowerCase()
        .replaceAll('&', ' and ')
        .replaceAll('+', ' plus ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export function resolveOfficialProvider(networkName = '') {
    const normalized = normalizeNetworkName(networkName);
    if (!normalized) return null;

    if (/\.tv$/i.test(String(networkName).trim()) && !/^(?:apple|nba|f1)\s/i.test(String(networkName).trim())) {
        return { name: 'MLB.TV', url: 'https://www.mlb.com/live-stream-games/' };
    }

    const rule = OFFICIAL_PROVIDER_RULES.find(candidate => candidate.match(normalized));
    return rule ? { name: rule.name, url: rule.url } : null;
}

function normalizeCompetitor(competitor = {}) {
    const entity = competitor.team || competitor.athlete || {};
    const logo = entity.logo || entity.logos?.find(item => isHttpsUrl(item?.href))?.href || '';
    return {
        id: String(entity.id || competitor.id || ''),
        name: entity.displayName || entity.fullName || entity.shortDisplayName || entity.name || competitor.displayName || 'TBD',
        shortName: entity.shortDisplayName || entity.name || entity.displayName || competitor.displayName || 'TBD',
        abbreviation: entity.abbreviation || '',
        logo: isHttpsUrl(logo) ? logo : '',
        homeAway: competitor.homeAway || '',
        score: competitor.score == null ? '' : String(competitor.score),
        winner: Boolean(competitor.winner)
    };
}

function normalizeStatus(status = {}) {
    const type = status.type || {};
    const sourceState = String(type.state || '').toLowerCase();
    const state = sourceState === 'in' ? 'live' : sourceState === 'post' ? 'final' : 'scheduled';
    return {
        state,
        detail: type.shortDetail || type.detail || type.description || (state === 'live' ? 'Live' : state === 'final' ? 'Final' : 'Scheduled'),
        clock: status.displayClock || '',
        period: Number(status.period) || 0,
        completed: Boolean(type.completed)
    };
}

function getEventDetailsUrl(event = {}) {
    const link = (event.links || []).find(candidate => (
        isHttpsUrl(candidate?.href)
        && Array.isArray(candidate.rel)
        && candidate.rel.includes('summary')
    )) || (event.links || []).find(candidate => isHttpsUrl(candidate?.href));
    return link?.href || '';
}

export function normalizeSportsEvent(event = {}, league = {}) {
    const competition = event.competitions?.[0] || {};
    const parsedStartTime = new Date(event.date || competition.date || '');
    const startTime = Number.isFinite(parsedStartTime.getTime()) ? parsedStartTime.toISOString() : '';
    const competitors = (competition.competitors || [])
        .map(normalizeCompetitor)
        .sort((a, b) => {
            const order = { away: 0, home: 1 };
            return (order[a.homeAway] ?? 2) - (order[b.homeAway] ?? 2);
        });
    const broadcasts = uniqueStrings((event.competitions || [])
        .flatMap(item => item.broadcasts || [])
        .flatMap(broadcast => broadcast.names || []));
    const address = competition.venue?.address || {};

    return {
        id: `${league.id || league.league || 'sports'}:${event.id || competition.id}`,
        sourceId: String(event.id || competition.id || ''),
        title: event.shortName || event.name || competition.notes?.[0]?.headline || league.label || 'Sports event',
        fullTitle: event.name || event.shortName || league.label || 'Sports event',
        startTime,
        league: {
            id: league.id || league.league || '',
            label: league.label || league.id || league.league || 'Sports',
            group: league.group || league.sport || 'sports'
        },
        status: normalizeStatus(event.status || competition.status),
        competitors,
        broadcasts,
        venue: {
            name: competition.venue?.fullName || '',
            location: [address.city, address.state, address.country].filter(Boolean).join(', ')
        },
        detailsUrl: getEventDetailsUrl(event)
    };
}

export function addViewingOptions(event, channels = []) {
    const channelById = new Map(channels.map(channel => [channel.id, channel]));
    const matchedChannels = [];
    const providers = [];

    for (const network of event.broadcasts || []) {
        const normalized = normalizeNetworkName(network);
        for (const channelId of CHANNEL_IDS_BY_BROADCAST.get(normalized) || []) {
            const channel = channelById.get(channelId);
            if (!channel || matchedChannels.some(candidate => candidate.id === channel.id)) continue;
            matchedChannels.push({
                id: channel.id,
                name: channel.name,
                logo: channel.logo || '',
                quality: channel.streams?.[0]?.quality || 'Auto'
            });
        }

        const provider = resolveOfficialProvider(network);
        if (provider && !providers.some(candidate => candidate.url === provider.url)) {
            providers.push({ ...provider, network });
        }
    }

    return {
        ...event,
        viewing: {
            channels: matchedChannels,
            providers,
            networks: [...(event.broadcasts || [])]
        }
    };
}

function formatEspnDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function createDateWindow(nowMs, daysBack, daysForward) {
    const today = new Date(nowMs);
    const from = new Date(today);
    const to = new Date(today);
    from.setUTCDate(from.getUTCDate() - daysBack);
    to.setUTCDate(to.getUTCDate() + daysForward);
    return {
        from: formatEspnDate(from),
        to: formatEspnDate(to),
        fromDate: `${formatEspnDate(from).slice(0, 4)}-${formatEspnDate(from).slice(4, 6)}-${formatEspnDate(from).slice(6)}`,
        toDate: `${formatEspnDate(to).slice(0, 4)}-${formatEspnDate(to).slice(4, 6)}-${formatEspnDate(to).slice(6)}`
    };
}

async function fetchLeagueEvents(fetchImpl, league, window, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const query = league.currentOnly ? '' : `?dates=${window.from}-${window.to}&limit=300`;
    const url = `${ESPN_API_ROOT}/${league.sport}/${league.league}/scoreboard${query}`;

    try {
        const response = await fetchImpl(url, {
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0 StreamOS-SportsGuide/1.0'
            }
        });
        if (response.status === 404) return [];
        if (!response.ok) throw new Error(`${league.label} schedule returned ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload.events)) throw new Error(`${league.label} returned an invalid schedule`);
        return payload.events.map(event => normalizeSportsEvent(event, league));
    } finally {
        clearTimeout(timeoutId);
    }
}

function sortEvents(events) {
    const statusOrder = { live: 0, scheduled: 1, final: 2 };
    return events.sort((a, b) => {
        const stateDifference = (statusOrder[a.status.state] ?? 3) - (statusOrder[b.status.state] ?? 3);
        if (stateDifference) return stateDifference;
        const aTime = Date.parse(a.startTime);
        const bTime = Date.parse(b.startTime);
        return a.status.state === 'final' ? bTime - aTime : aTime - bTime;
    });
}

export function createSportsGuideService({
    fetchImpl = fetch,
    leagues = SPORTS_LEAGUES,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    batchSize = DEFAULT_BATCH_SIZE,
    batchDelayMs = DEFAULT_BATCH_DELAY_MS,
    daysBack = DEFAULT_DAYS_BACK,
    daysForward = DEFAULT_DAYS_FORWARD,
    now = () => Date.now(),
    sleep = delay => new Promise(resolve => setTimeout(resolve, delay))
} = {}) {
    let cachedGuide = null;
    let cacheExpiresAt = 0;
    let refreshPromise = null;

    async function refreshGuide() {
        const window = createDateWindow(now(), daysBack, daysForward);
        const events = [];
        const warnings = [];
        let successfulLeagues = 0;

        const results = await Promise.allSettled(leagues.map(async (league, index) => {
            const startDelay = Math.floor(index / batchSize) * batchDelayMs;
            if (startDelay > 0) await sleep(startDelay);
            return fetchLeagueEvents(fetchImpl, league, window, requestTimeoutMs);
        }));

        results.forEach((result, index) => {
            const league = leagues[index];
            if (result.status === 'fulfilled') {
                successfulLeagues += 1;
                events.push(...result.value);
            } else {
                warnings.push(`${league.label} is temporarily unavailable.`);
            }
        });

        if (!successfulLeagues) throw new Error('All sports schedules are currently unavailable');

        const windowStart = Date.parse(`${window.fromDate}T00:00:00Z`);
        const windowEnd = Date.parse(`${window.toDate}T23:59:59Z`);
        const deduplicated = sortEvents(events.filter((event, index, all) => {
            const startTime = Date.parse(event.startTime);
            return event.sourceId
                && Number.isFinite(startTime)
                && startTime >= windowStart
                && startTime <= windowEnd
                && all.findIndex(candidate => candidate.id === event.id) === index;
        }));
        const counts = new Map();
        deduplicated.forEach(event => counts.set(event.league.id, (counts.get(event.league.id) || 0) + 1));

        cachedGuide = {
            events: deduplicated,
            leagues: leagues
                .map(league => ({ id: league.id, label: league.label, group: league.group, count: counts.get(league.id) || 0 }))
                .filter(league => league.count > 0),
            window: { from: window.fromDate, to: window.toDate },
            source: 'ESPN public scoreboard data',
            warning: warnings.length ? `${warnings.length} league schedule${warnings.length === 1 ? '' : 's'} could not refresh.` : '',
            partial: warnings.length > 0,
            refreshedAt: new Date(now()).toISOString(),
            stale: false
        };
        cacheExpiresAt = now() + cacheTtlMs;
        return cachedGuide;
    }

    async function getGuide({ force = false } = {}) {
        if (!force && cachedGuide && now() < cacheExpiresAt) return cachedGuide;
        if (refreshPromise) return refreshPromise;

        refreshPromise = refreshGuide()
            .catch(error => {
                if (!cachedGuide) throw error;
                return {
                    ...cachedGuide,
                    stale: true,
                    warning: 'Using the most recent game guide while schedules refresh.'
                };
            })
            .finally(() => {
                refreshPromise = null;
            });
        return refreshPromise;
    }

    return { getGuide };
}
