import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { refreshRegistry, registryLinks, registryAllows, updateSourceHealth, sourceHealthPenalty } from '../www/js/source-policy.js';
import { normalizePlaybackOptimization, createHlsPlaybackConfig, configureHlsPlayback } from '../www/js/playback-optimization.js';

// Run the actual player module with small browser/bridge substitutes, so source
// replacement and metadata wiring are exercised together with the saved setting.
const source = (await readFile(new URL('../www/js/player.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?$/gm, '')
    .replace(/^export /gm, '');
const storage = new Map();
const listeners = new Map();
const intervals = new Set();
let nextTimer = 1;
const video = {
    paused: true, currentTime: 0, duration: 3600, muted: false, volume: 1,
    style: {},
    // Browser pause events are queued, so cleanup cannot rely on synchronous onpause.
    pause() { this.paused = true; },
    play() { this.paused = false; this.onplay?.(); return Promise.resolve(); },
    load() {},
    removeAttribute(name) { delete this[name]; }
};
const classList = { add() {}, remove() {} };
class FakeHls {
    static Events = { MANIFEST_PARSED: 'manifest', LEVELS_UPDATED: 'levels', ERROR: 'error' };
    static instances = [];
    static isSupported() { return true; }
    constructor(config) {
        assert.ok(FakeHls.instances.every(instance => instance.destroyed), 'old HLS downloads must stop before a replacement starts');
        this.config = config;
        this.handlers = new Map();
        this.levels = [{ height: 720, width: 1280, bitrate: 2_000_000 }];
        FakeHls.instances.push(this);
    }
    on(event, callback) {
        const callbacks = this.handlers.get(event) || [];
        callbacks.push(callback);
        this.handlers.set(event, callbacks);
    }
    attachMedia(media) { this.media = media; }
    loadSource(url) { this.url = url; }
    emit(event, data) { for (const callback of this.handlers.get(event) || []) callback(event, data); }
    destroy() { this.destroyed = true; }
}
const context = vm.createContext({
    console, Event, URL, Hls: FakeHls,
    normalizePlaybackOptimization, createHlsPlaybackConfig, configureHlsPlayback, refreshRegistry, registryLinks, registryAllows, updateSourceHealth, sourceHealthPenalty,
    DOM: { videoPlayer: video, autoplayOverlay: { classList }, playerNextEpBtn: { classList } },
    document: { getElementById() { return null; } },
    localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key)
    },
    location: { hash: '#details' },
    addEventListener: (name, callback) => listeners.set(name, callback),
    dispatchEvent() {},
    setTimeout: () => nextTimer++, clearTimeout() {},
    setInterval() { const id = nextTimer++; intervals.add(id); return id; },
    clearInterval: id => intervals.delete(id),
    navigateTo(hash) { context.location.hash = hash; },
    getSeriesProgress: () => ({ last_season: 1, last_episode: 2 }),
    getProxyHost: () => 'http://backend.example',
    clearPlaybackCompleted() {}, markPlaybackCompleted() {}
});
vm.runInContext(source, context);
const run = code => vm.runInContext(code, context);
run("currentMovieContext = { id: 42, type: 'movie', title: 'Sample' }");
assert.equal(run('getPlaybackSettings().playbackOptimization'), 'auto');
run("savePlaybackSettings({ playbackOptimization: 'data-saver', autoplayNextEpisode: false })");
assert.equal(run('getPlaybackSettings().playbackOptimization'), 'data-saver');
run("savePlaybackSettings({ sourcePreference: 'direct' })");
assert.equal(run('getPlaybackSettings().playbackOptimization'), 'data-saver');
assert.equal(run('getPlaybackSettings().autoplayNextEpisode'), false);
run("savePlaybackSettings({ playbackOptimization: 'invalid' })");
assert.equal(run('getPlaybackSettings().playbackOptimization'), 'auto');
storage.set('streamy_playback_settings_v1', '{bad json');
assert.equal(run('getPlaybackSettings().playbackOptimization'), 'auto');

run("savePlaybackSettings({ playbackOptimization: 'data-saver' })");
let nativeArgs;
context.NativeBridge = { playStream() {}, playStreamWithMetadata(...args) { nativeArgs = args; } };
run("currentIntroMarker = {startMs: 10000, endMs: 60000}; currentRecapMarker = {startMs: 0, endMs: 9000}; currentMovieContext.type = 'tv'");
run("playNativeVideo('https://cdn.example/master.m3u8', {referer: 'https://host.example', origin: 'https://host.example', cookie: 'session=test'})");
const metadata = JSON.parse(nativeArgs[13]);
assert.equal(metadata.playbackOptimization, 'data-saver');
assert.equal(metadata.introMarker.endMs, 60000);
assert.equal(metadata.recapMarker.endMs, 9000);
assert.equal(nativeArgs[5], 'https://host.example');
assert.equal(nativeArgs[7], 'session=test');
delete context.NativeBridge;
run("currentMovieContext.type = 'movie'; currentPlaybackLinks = [{url:'https://cdn.example/a.m3u8',type:'hls'},{url:'https://cdn.example/b.m3u8',type:'hls'}]");
run('playSourceAt(0)');
const first = FakeHls.instances[0];
first.emit(FakeHls.Events.MANIFEST_PARSED);
assert.equal(first.autoLevelCapping, 0);
assert.equal(intervals.size, 1);
video.currentTime = 95;
run('playSourceAt(1)');
assert.ok(first.destroyed);
assert.equal(intervals.size, 1, 'source changes replace the progress timer');
assert.equal(run('getSavedPlaybackPositionMs()'), 95000, 'source replacement preserves progress');
const second = FakeHls.instances[1];
first.emit(FakeHls.Events.ERROR, { fatal: true, type: 'network' });
assert.equal(run('currentPlaybackSourceIndex'), 1, 'late callbacks cannot fail over the new source');
listeners.get('streamy-stop-web-playback')();
assert.ok(second.destroyed);
assert.equal(intervals.size, 0);
assert.equal(video.onerror, null);
assert.equal(video.onloadedmetadata, null);
assert.equal(video.src, undefined);
listeners.get('streamy-stop-web-playback')();
assert.equal(run('getSavedPlaybackPositionMs()'), 95000, 'empty route cleanup must not erase saved progress');
second.emit(FakeHls.Events.MANIFEST_PARSED);
assert.equal(video.paused, true, 'late manifest callback cannot restart playback after leaving');

// Actual browser events only count a source once playback begins, and a fatal
// error switches once while preserving the live position.
run("currentPlaybackLinks = [{server:'First',url:'https://first.example/a.m3u8',type:'hls'},{server:'Second',url:'https://second.example/b.m3u8',type:'hls'}]");
run('currentPlaybackSourceIndex = -1; sourceHandoffPositionMs = null; playSourceAt(0)');
const failedHls = FakeHls.instances.at(-1);
failedHls.emit(FakeHls.Events.MANIFEST_PARSED);
assert.equal(run("getSourceHealth(currentPlaybackLinks[0]).successes || 0"), 0, 'manifest alone is not playback');
video.onplaying();
assert.equal(run("getSourceHealth(currentPlaybackLinks[0]).successes"), 1);
video.currentTime = 12;
failedHls.emit(FakeHls.Events.ERROR, {fatal:true,type:'network'});
assert.equal(run('currentPlaybackSourceIndex'), 1);
assert.equal(run("getSourceHealth(currentPlaybackLinks[0]).failures"), 1, 'one error must be counted once');
const recoveryHls = FakeHls.instances.at(-1);
recoveryHls.emit(FakeHls.Events.MANIFEST_PARSED);
assert.equal(video.currentTime, 12, 'short playback positions survive failover');
listeners.get('streamy-stop-web-playback')();

console.log('Playback settings, native metadata, and browser lifecycle tests passed.');
