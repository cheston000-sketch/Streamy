import assert from 'node:assert/strict';
import {
    addViewingOptions,
    createSportsGuideService,
    normalizeNetworkName,
    normalizeSportsEvent,
    resolveOfficialProvider
} from '../server/sports-guide.js';

const nflLeague = { id: 'nfl', label: 'NFL', sport: 'football', league: 'nfl', group: 'football' };
const rawEvent = {
    id: '401999001',
    name: 'Buffalo Bills at Kansas City Chiefs',
    shortName: 'BUF @ KC',
    date: '2026-09-18T00:15:00Z',
    status: {
        type: { state: 'pre', shortDetail: 'Thu, 8:15 PM EDT', completed: false }
    },
    competitions: [{
        id: '401999001',
        venue: {
            fullName: 'Arrowhead Stadium',
            address: { city: 'Kansas City', state: 'MO', country: 'USA' }
        },
        broadcasts: [{ market: 'national', names: ['ESPN', 'ABC'] }],
        competitors: [
            {
                homeAway: 'home',
                score: '0',
                team: { id: '12', displayName: 'Kansas City Chiefs', shortDisplayName: 'Chiefs', abbreviation: 'KC', logo: 'https://img.example.com/kc.png' }
            },
            {
                homeAway: 'away',
                score: '0',
                team: { id: '2', displayName: 'Buffalo Bills', shortDisplayName: 'Bills', abbreviation: 'BUF', logo: 'https://img.example.com/buf.png' }
            }
        ]
    }],
    links: [{ rel: ['summary', 'desktop', 'event'], href: 'https://www.espn.com/nfl/game/_/gameId/401999001' }]
};

const normalized = normalizeSportsEvent(rawEvent, nflLeague);
assert.equal(normalized.id, 'nfl:401999001');
assert.equal(normalized.status.state, 'scheduled');
assert.deepEqual(normalized.competitors.map(competitor => competitor.shortName), ['Bills', 'Chiefs']);
assert.deepEqual(normalized.broadcasts, ['ESPN', 'ABC']);
assert.equal(normalized.venue.location, 'Kansas City, MO, USA');
assert.equal(normalized.detailsUrl, 'https://www.espn.com/nfl/game/_/gameId/401999001');

assert.equal(normalizeNetworkName('FIFA+ Women'), 'fifa plus women');
assert.deepEqual(resolveOfficialProvider('ESPN2'), {
    name: 'ESPN',
    url: 'https://www.espn.com/watch/'
});
assert.deepEqual(resolveOfficialProvider('Tigers.TV'), {
    name: 'MLB.TV',
    url: 'https://www.mlb.com/live-stream-games/'
});
assert.equal(resolveOfficialProvider('Unknown Local 12'), null);

const golazoEvent = {
    ...normalized,
    broadcasts: ['CBS Sports Golazo Network', 'Paramount+']
};
const viewingEvent = addViewingOptions(golazoEvent, [{
    id: 'CBSSportsGolazoNetwork.us',
    name: 'CBS Sports Golazo Network',
    logo: 'https://img.example.com/golazo.png',
    streams: [{ quality: '720p' }]
}]);
assert.deepEqual(viewingEvent.viewing.channels, [{
    id: 'CBSSportsGolazoNetwork.us',
    name: 'CBS Sports Golazo Network',
    logo: 'https://img.example.com/golazo.png',
    quality: '720p'
}]);
assert.equal(viewingEvent.viewing.providers[0].name, 'Paramount+');

let fetchCount = 0;
const service = createSportsGuideService({
    leagues: [
        nflLeague,
        { id: 'nba', label: 'NBA', sport: 'basketball', league: 'nba', group: 'basketball' }
    ],
    fetchImpl: async url => {
        fetchCount += 1;
        if (url.includes('/nba/')) {
            return { ok: false, status: 503, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => ({ events: [rawEvent] }) };
    },
    now: () => Date.parse('2026-09-15T12:00:00Z'),
    cacheTtlMs: 60_000,
    batchSize: 5,
    batchDelayMs: 0
});

const firstGuide = await service.getGuide();
const cachedGuide = await service.getGuide();
assert.strictEqual(cachedGuide, firstGuide);
assert.equal(firstGuide.events.length, 1);
assert.equal(firstGuide.leagues[0].id, 'nfl');
assert.equal(firstGuide.partial, true);
assert.match(firstGuide.warning, /1 league schedule/);
assert.deepEqual(firstGuide.unavailableLeagues.map(league => league.id), ['nba']);
assert.match(firstGuide.unavailableLeagues[0].reason, /503/);
assert.deepEqual(firstGuide.window, { from: '2026-09-14', to: '2026-09-29' });
assert.equal(fetchCount, 3);

console.log('Sports guide tests passed.');
