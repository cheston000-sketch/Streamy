import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../www/js/router.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?$/gm, '')
    .replace(/^export /gm, '');

function element() {
    const classes = new Set();
    return {
        classList: {
            add: value => classes.add(value),
            remove: value => classes.delete(value),
            contains: value => classes.has(value),
            toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); }
        },
        style: {},
        focus() { this.focused = true; }
    };
}

const views = new Map(['home', 'search', 'player', 'details', 'links', 'category', 'settings']
    .map(name => [`view-${name}`, element()]));
const tabs = new Map(['home', 'movies', 'tv', 'watchlist', 'search', 'settings']
    .map(name => [name, element()]));
const events = [];
const focusRestores = [];
const location = { hash: '#home' };
const document = {
    body: element(),
    getElementById: id => views.get(id) || null,
    querySelectorAll(selector) {
        if (selector === '.view') return [...views.values()];
        if (selector === '.nav-tab[data-view]') return [...tabs.values()];
        return [];
    },
    querySelector(selector) {
        const tab = selector.match(/^\.nav-tab\[data-view="(.*)"\]$/);
        return tab ? tabs.get(tab[1]) || null : null;
    }
};
const context = vm.createContext({
    document, location, Event,
    NavigationManager: { saveFocus() {}, restoreFocus: (...args) => focusRestores.push(args) },
    history: { replaceState(_state, _title, hash) { location.hash = hash; } },
    dispatchEvent: event => events.push(event.type),
    setTimeout: callback => callback(),
    addEventListener() {}
});
vm.runInContext(source, context);
const run = code => vm.runInContext(code, context);

for (const hash of ['#live-tv', '#live-tv/guide', '#removed-feature']) {
    events.length = 0;
    location.hash = hash;
    run('handleRoute()');
    assert.equal(location.hash, '#home', 'Retired and unsupported links must resolve to Home');
    assert.equal(views.get('view-home').classList.contains('hidden'), false);
    assert.equal(tabs.get('home').classList.contains('active'), true);
    assert.ok(events.includes('load-home-rows'));
    assert.equal(events.some(event => event.includes('live-tv')), false);
    assert.deepEqual(focusRestores.at(-1), ['#home', '.poster-card']);
}

for (const [hash, event, tab] of [
    ['#home', 'load-home-rows', 'home'],
    ['#movies', 'load-movie-rows', 'movies'],
    ['#tv', 'load-tv-rows', 'tv'],
    ['#watchlist', 'load-watchlist-rows', 'watchlist']
]) {
    events.length = 0;
    location.hash = hash;
    run('handleRoute()');
    assert.equal(location.hash, hash);
    assert.equal(views.get('view-home').classList.contains('hidden'), false);
    assert.ok(events.includes(event));
    assert.equal(tabs.get(tab).classList.contains('active'), true);
}

location.hash = '#player';
events.length = 0;
run('handleRoute()');
assert.equal(views.get('view-player').classList.contains('hidden'), false);
assert.equal(events.includes('streamy-stop-web-playback'), false, 'Entering the player must not stop its playback');
assert.deepEqual(focusRestores.at(-1), ['#player', '#player-back-btn']);
run("navigateTo('#settings'); handleRoute()");
assert.equal(views.get('view-settings').classList.contains('hidden'), false);
assert.ok(events.includes('streamy-stop-web-playback'));
assert.deepEqual(focusRestores.at(-1), ['#settings', '#setting-backend-input']);
assert.equal(run('navigateBack()'), true);
assert.equal(location.hash, '#player', 'Back navigation must retain supported history');

console.log('Routing and retired-link fallback tests passed.');
