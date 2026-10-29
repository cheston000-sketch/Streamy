import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const player = await readFile(new URL('../www/js/player.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../www/server/index.js', import.meta.url), 'utf8');

assert.doesNotMatch(player, /player\.videasy\.(?:net|to)/i);
assert.doesNotMatch(server, /VIDEASY_SOURCE_ENDPOINTS|VIDEASY_PROVIDER_ENDPOINTS/);
assert.match(player, /const availableLinks = links\.filter\(link => !isRetiredSource\(link\)\)/);
assert.match(server, /function excludeRetiredSources\(links = \[\]\)/);
assert.match(server, /dedupeLinks\(excludeRetiredSources\(\[\.\.\.directLinks, \.\.\.stremioLinks, \.\.\.builtInLinks\]\)\)/);

console.log('Removed provider filtering tests passed.');

// Exercise the real provider builders and filtering without booting the UI/server.
function extractFunction(source, name) {
    const start = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\n}\n', start) + 2;
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end);
}
const clientFallback = new Function('getImdbId', extractFunction(player, 'getFallbackStreamLinks') + '; return getFallbackStreamLinks;')(() => 'tt0137523');
const backendFallback = new Function(extractFunction(server, 'buildFallbackLinks') + '; return buildFallbackLinks;')();
for (const type of ['movie', 'tv']) {
    const expected = type === 'tv' ? 'https://movietvapi.stream/embed/tv/550/2/3' : 'https://movietvapi.stream/embed/movie/550';
    for (const links of [clientFallback({id:550,type},2,3), backendFallback({tmdb:550,type,season:2,episode:3})]) {
        assert.equal(links.find(l => l.server === 'MovieTV API')?.url, expected);
        assert.ok(!links.some(l => l.url.includes('autoembed.pro')));
    }
}
const retired = new Function(extractFunction(player, 'isRetiredSource') + '; return isRetiredSource;')();
const exclude = new Function(extractFunction(server, 'excludeRetiredSources') + '; return excludeRetiredSources;')();
for (const url of ['https://autoembed.pro/embed/movie/550','https://PLAYER.AUTOEMBED.PRO/embed/tv/1399/1/1','https://player.videasy.net/movie/550']) {
    assert.equal(retired({url}), true);
    assert.equal(exclude([{url}]).length, 0);
}
assert.equal(retired({url:'https://movietvapi.stream/embed/movie/550'}), false);
assert.equal(exclude([{url:'https://movietvapi.stream/embed/movie/550'}]).length, 1);
console.log('Movie/episode replacement and stale source filtering tests passed.');
