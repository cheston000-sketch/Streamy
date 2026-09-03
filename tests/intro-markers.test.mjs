import assert from 'node:assert/strict';
import {
    chooseIntroMarker,
    createIntroMarkerResolver,
    normalizeIntroCandidate,
    normalizeIntroLookup
} from '../www/server/intro-markers.js';

function jsonResponse(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return payload;
        }
    };
}

assert.deepEqual(
    normalizeIntroLookup({ imdbId: 'TT26545992', season: '1', episode: '2', durationSeconds: '3092.715' }),
    { imdbId: 'tt26545992', season: 1, episode: 2, durationSeconds: 3092.715 }
);
assert.equal(normalizeIntroLookup({ imdbId: '26545992', season: 1, episode: 2 }), null);
assert.equal(normalizeIntroLookup({ imdbId: 'tt26545992', season: 0, episode: 2 }), null);

assert.equal(
    normalizeIntroCandidate({ start_ms: 0, end_ms: 90_000, match: 'out-of-range', confidence: 1 }, 'skipdb'),
    null
);
assert.equal(normalizeIntroCandidate({ start_ms: 90_000, end_ms: 10_000 }, 'introdb'), null);
assert.equal(normalizeIntroCandidate({ start_ms: 0, end_ms: 90_000, confidence: 0.49 }, 'introdb'), null);

const selectedMarker = chooseIntroMarker([
    normalizeIntroCandidate({ start_ms: 20_000, end_ms: 80_000, confidence: 0.6, match: 'exact' }, 'skipdb'),
    normalizeIntroCandidate({ start_ms: 0, end_ms: 9_000, confidence: 1 }, 'introdb')
]);
assert.equal(selectedMarker.provider, 'introdb');
assert.equal(selectedMarker.endMs, 9_000);

let requestCount = 0;
const resolver = createIntroMarkerResolver({
    logger: null,
    fetchImpl: async url => {
        requestCount++;
        if (url.hostname === 'api.skipdb.tv') {
            return jsonResponse({ segments: { intro: null } });
        }
        return jsonResponse({
            intro: {
                start_ms: 0,
                end_ms: 9_000,
                confidence: 1
            }
        });
    }
});

const firstResult = await resolver.resolve({ imdbId: 'tt26545992', season: 1, episode: 2 });
assert.equal(firstResult.cached, false);
assert.equal(firstResult.marker.provider, 'introdb');
assert.equal(firstResult.marker.endMs, 9_000);
assert.equal(requestCount, 2);

const cachedResult = await resolver.resolve({ imdbId: 'tt26545992', season: 1, episode: 2 });
assert.equal(cachedResult.cached, true);
assert.equal(cachedResult.marker.endMs, 9_000);
assert.equal(requestCount, 2);

console.log('Intro marker tests passed.');
