import assert from 'node:assert/strict';
import {
    areRatingsKidsSafe,
    getEmbeddedUsRatings,
    getUsRatingsFromPayload,
    hasKidsSafeCatalogShape,
    normalizeUsRating,
    resolveMediaType
} from '../www/js/kids-safety.js';

assert.equal(normalizeUsRating(' tv y7 fv '), 'TV-Y7-FV');
assert.equal(resolveMediaType({ media_type: 'tv' }, 'movie'), 'tv');
assert.equal(resolveMediaType({ type: 'movie' }), 'movie');

assert.equal(areRatingsKidsSafe('movie', ['G']), true);
assert.equal(areRatingsKidsSafe('movie', ['PG']), true);
assert.equal(areRatingsKidsSafe('movie', ['PG', 'PG-13']), false);
assert.equal(areRatingsKidsSafe('movie', []), false);
assert.equal(areRatingsKidsSafe('tv', ['TV-Y']), true);
assert.equal(areRatingsKidsSafe('tv', ['TV-Y7-FV']), true);
assert.equal(areRatingsKidsSafe('tv', ['TV-PG']), false);
assert.equal(areRatingsKidsSafe('tv', ['TV-14']), false);

assert.deepEqual(getEmbeddedUsRatings({ certification: 'PG' }), ['PG']);
assert.deepEqual(getEmbeddedUsRatings({ rating: '9.0 / 10 Match' }), []);
assert.equal(hasKidsSafeCatalogShape({ id: 1, type: 'movie', adult: false }), true);
assert.equal(hasKidsSafeCatalogShape({ id: 1, type: 'movie', adult: true }), false);
assert.equal(hasKidsSafeCatalogShape({ id: 1, media_type: 'person' }), false);

const moviePayload = {
    results: [{
        iso_3166_1: 'US',
        release_dates: [{ certification: 'PG' }, { certification: '' }]
    }]
};
assert.deepEqual(getUsRatingsFromPayload(moviePayload, 'movie'), ['PG']);

const conflictingMoviePayload = {
    results: [{
        iso_3166_1: 'US',
        release_dates: [{ certification: 'PG' }, { certification: 'PG-13' }]
    }]
};
assert.equal(areRatingsKidsSafe('movie', getUsRatingsFromPayload(conflictingMoviePayload, 'movie')), false);

const tvPayload = { results: [{ iso_3166_1: 'US', rating: 'TV-G' }] };
assert.deepEqual(getUsRatingsFromPayload(tvPayload, 'tv'), ['TV-G']);

console.log('Kids safety tests passed.');
