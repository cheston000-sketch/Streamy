import assert from 'node:assert/strict';
import { buildLiveTvCatalog, createLiveTvService } from '../server/live-tv.js';

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
assert.deepEqual(catalog.channels.map(channel => channel.id), ['ABCNewsLive.us', 'PBSKids.us']);
assert.equal(catalog.channels[0].logo, 'https://img.example.com/current.svg');
assert.equal(catalog.channels[0].streams[0].url, 'https://cdn.example.com/abc-backup.m3u8');
assert.equal(catalog.channels[0].streams.length, 3);
assert.equal(catalog.channels[0].streams[2].url, 'https://pb-test.akamaized.net/abc-hevc.m3u8');
assert.equal(catalog.channels[0].category, 'news');
assert.equal(catalog.channels[1].category, 'kids');
assert.equal(catalog.categories.find(category => category.id === 'featured')?.count, 2);
assert.equal(catalog.categories.find(category => category.id === 'news')?.count, 1);
assert.equal(catalog.categories.find(category => category.id === 'kids')?.count, 1);

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
assert.equal(firstResult.channels.length, 2);
assert.strictEqual(secondResult, firstResult);
assert.equal(fetchCount, 4);

console.log('Live TV catalog tests passed.');
