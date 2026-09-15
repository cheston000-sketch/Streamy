import assert from 'node:assert/strict';
import { buildLiveTvCatalog, createLiveTvService, CURATED_CHANNEL_IDS } from '../server/live-tv.js';

const expectedSportsExpansion = [
    'ACCDigitalNetwork.us',
    'BEKSports.us',
    'CBSSportsGolazoNetwork.us',
    'DraftKingsNetwork.us',
    'FITE247.us',
    'FloHockey.us',
    'FloRacing.us',
    'GloryKickboxing.us',
    'LacrosseTV.us',
    'MonsterJam.us',
    'NBCSportsNOW.us',
    'NHLNetwork.us',
    'NHRATV.us',
    'Overtime.us',
    'PFLMMA.us',
    'RacerNetwork.us',
    'RacerSelect.us',
    'SlopesTV.us',
    'SportsGrid.us',
    'Strongman.us',
    'SwerveCombat.us',
    'SwerveSports.us',
    'TennisChannel.us',
    'WomensSportsNetwork.us',
    'CricketGold.au',
    'FIFAPlus.uk',
    'FIFAPlusWomen.uk',
    'FightNetwork.ca',
    'FUELTV.pt',
    'RedBullTV.at'
];

assert.equal(new Set(CURATED_CHANNEL_IDS).size, CURATED_CHANNEL_IDS.length);
for (const channelId of expectedSportsExpansion) {
    assert.ok(CURATED_CHANNEL_IDS.includes(channelId), `${channelId} must remain in the sports catalog`);
}

const fixtures = {
    channels: [
        {
            id: 'ABCNewsLive.us',
            name: 'ABC News Live',
            network: 'ABC News',
            country: 'US',
            categories: ['news'],
            is_nsfw: false,
            closed: null,
            website: 'https://abcnews.go.com/Live'
        },
        {
            id: 'PBSKids.us',
            name: 'PBS Kids',
            network: 'PBS',
            country: 'US',
            categories: ['education', 'kids'],
            is_nsfw: false,
            closed: null,
            website: 'https://pbskids.org/'
        },
        {
            id: 'CBSNews247.us',
            name: 'CBS News 24/7',
            country: 'US',
            categories: ['news'],
            is_nsfw: false,
            closed: null
        },
        {
            id: 'FIFAPlus.uk',
            name: 'FIFA+',
            country: 'UK',
            categories: ['sports'],
            is_nsfw: false,
            closed: null,
            website: 'https://www.plus.fifa.com/'
        },
        {
            id: 'WomensSportsNetwork.us',
            name: "Women's Sports Network",
            country: 'US',
            categories: [],
            is_nsfw: false,
            closed: null
        },
        {
            id: 'NFLChannel.us',
            name: 'Closed Sports Feed',
            country: 'US',
            categories: ['sports'],
            is_nsfw: false,
            closed: '2025-01-01'
        },
        {
            id: 'MLB.us',
            name: 'Adult Feed',
            country: 'US',
            categories: ['sports'],
            is_nsfw: true,
            closed: null
        }
    ],
    streams: [
        { channel: 'ABCNewsLive.us', url: 'https://jmp2.uk/abc.m3u8', quality: '1080p' },
        { channel: 'ABCNewsLive.us', url: 'https://cdn.example.com/abc.m3u8', quality: '720p' },
        { channel: 'ABCNewsLive.us', url: 'https://cdn.example.com/abc-backup.m3u8', quality: '1080p' },
        { channel: 'ABCNewsLive.us', url: 'https://pb-test.akamaized.net/abc-hevc.m3u8', quality: '2160p' },
        { channel: 'ABCNewsLive.us', url: 'https://headers.example.com/abc.m3u8', referrer: 'https://example.com/' },
        { channel: 'PBSKids.us', url: 'https://kids.example.com/live.m3u8', quality: '720p' },
        { channel: 'CBSNews247.us', url: 'https://news.example.com/live.m3u8' },
        { channel: 'FIFAPlus.uk', url: 'https://sports.example.com/fifa.m3u8', quality: '720p' },
        { channel: 'WomensSportsNetwork.us', url: 'https://sports.example.com/women.m3u8', quality: '1080p' },
        { channel: 'NFLChannel.us', url: 'https://sports.example.com/live.m3u8' },
        { channel: 'MLB.us', url: 'https://sports.example.com/adult.m3u8' }
    ],
    logos: [
        { channel: 'ABCNewsLive.us', url: 'https://img.example.com/old.png', in_use: false, tags: [] },
        { channel: 'ABCNewsLive.us', url: 'https://img.example.com/current.svg', in_use: true, tags: ['horizontal', 'white'], format: 'SVG', width: 800, height: 200 },
        { channel: 'PBSKids.us', url: 'https://img.example.com/kids.png', in_use: true, format: 'PNG', width: 500, height: 500 }
    ],
    blocklist: [{ channel: 'CBSNews247.us', reason: 'dmca' }]
};

const catalog = buildLiveTvCatalog(fixtures);
assert.deepEqual(catalog.channels.map(channel => channel.id), [
    'ABCNewsLive.us',
    'FIFAPlus.uk',
    'WomensSportsNetwork.us',
    'PBSKids.us'
]);
assert.equal(catalog.channels[0].logo, 'https://img.example.com/current.svg');
assert.equal(catalog.channels[0].streams[0].url, 'https://cdn.example.com/abc-backup.m3u8');
assert.equal(catalog.channels[0].streams.length, 3);
assert.equal(catalog.channels[0].streams[2].url, 'https://pb-test.akamaized.net/abc-hevc.m3u8');
assert.equal(catalog.channels[0].category, 'news');
assert.equal(catalog.channels.find(channel => channel.id === 'PBSKids.us')?.category, 'kids');
assert.equal(catalog.channels.find(channel => channel.id === 'FIFAPlus.uk')?.category, 'sports');
assert.equal(catalog.channels.find(channel => channel.id === 'WomensSportsNetwork.us')?.category, 'sports');
assert.equal(catalog.categories.find(category => category.id === 'featured')?.count, 4);
assert.equal(catalog.categories.find(category => category.id === 'news')?.count, 1);
assert.equal(catalog.categories.find(category => category.id === 'kids')?.count, 1);
assert.equal(catalog.categories.find(category => category.id === 'sports')?.count, 2);

const payloads = [fixtures.channels, fixtures.streams, fixtures.logos, fixtures.blocklist];
let fetchCount = 0;
const service = createLiveTvService({
    fetchImpl: async () => ({
        ok: true,
        json: async () => payloads[fetchCount++ % payloads.length]
    }),
    cacheTtlMs: 60_000,
    now: () => 1_000
});

const firstResult = await service.getCatalog();
const secondResult = await service.getCatalog();
assert.equal(firstResult.channels.length, 4);
assert.strictEqual(secondResult, firstResult);
assert.equal(fetchCount, 4);

console.log('Live TV catalog tests passed.');
