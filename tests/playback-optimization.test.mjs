import assert from 'node:assert/strict';
import Hls from 'hls.js';
import {
    normalizePlaybackOptimization,
    createHlsPlaybackConfig,
    configureHlsPlayback
} from '../www/js/playback-optimization.js';

assert.equal(Hls.version, '1.6.17');
for (const mode of ['auto', 'data-saver', 'original']) {
    assert.equal(normalizePlaybackOptimization(mode), mode);
}
for (const value of [undefined, null, '', 'invalid', '720p', {}, 1]) {
    assert.equal(normalizePlaybackOptimization(value), 'auto');
}

{
    const original = new Hls(createHlsPlaybackConfig('original'));
    const auto = new Hls(createHlsPlaybackConfig('auto'));
    const saver = new Hls(createHlsPlaybackConfig('data-saver'));
    try {
        assert.equal(original.config.abrBandWidthFactor, Hls.DefaultConfig.abrBandWidthFactor);
        assert.equal(original.config.maxMaxBufferLength, Hls.DefaultConfig.maxMaxBufferLength);
        assert.equal(original.config.backBufferLength, Hls.DefaultConfig.backBufferLength);
        assert.equal(auto.autoLevelCapping, -1, 'Auto must retain access to high quality variants');
        assert.equal(auto.config.capLevelToPlayerSize, false);
        assert.ok(auto.config.abrBandWidthFactor < original.config.abrBandWidthFactor);
        assert.ok(auto.config.abrBandWidthUpFactor < original.config.abrBandWidthUpFactor);
        assert.ok(Number.isFinite(auto.config.backBufferLength));
        assert.ok(auto.config.maxMaxBufferLength >= auto.config.maxBufferLength);
        assert.ok(auto.config.maxMaxBufferLength < original.config.maxMaxBufferLength);
        assert.deepEqual(saver.userConfig, auto.userConfig);
    } finally {
        original.destroy();
        auto.destroy();
        saver.destroy();
    }
}
assert.deepEqual(createHlsPlaybackConfig('unknown'), createHlsPlaybackConfig('auto'));

class TestHls {
    static Events = Hls.Events;
    static instances = [];
    static isSupported() { return true; }
    constructor(config = {}) {
        this.config = config;
        this.levels = [];
        this.autoLevelCapping = -1;
        this.currentLevel = -1;
        this.listeners = new Map();
        TestHls.instances.push(this);
    }
    on(event, listener) {
        const handlers = this.listeners.get(event) || [];
        handlers.push(listener);
        this.listeners.set(event, handlers);
    }
    off(event, listener) {
        this.listeners.set(event, (this.listeners.get(event) || []).filter(handler => handler !== listener));
    }
    emit(event, data = {}) {
        for (const handler of this.listeners.get(event) || []) handler(event, data);
    }
    loadSource(url) { this.url = url; }
    attachMedia(video) { this.video = video; }
    destroy() { this.destroyed = true; this.listeners.clear(); }
}
const rendition = (height, bitrate, extra = {}) => ({ width: Math.round(height * 16 / 9), height, bitrate, ...extra });
const hls = new TestHls();
const cleanup = configureHlsPlayback(hls, Hls, 'data-saver');
assert.equal(hls.autoLevelCapping, -1, 'Wait for a real manifest before applying a cap');
hls.levels = [rendition(360, 450_000), rendition(480, 900_000), rendition(720, 2_500_000), rendition(1080, 5_000_000), rendition(2160, 18_000_000)];
hls.emit(Hls.Events.MANIFEST_PARSED, { levels: hls.levels });
assert.equal(hls.autoLevelCapping, 2);
assert.equal(hls.currentLevel, -1, 'Data Saver must leave automatic quality selection enabled');

hls.levels = [rendition(360, 600_000), rendition(720, 3_000_000), rendition(1080, 4_000_000)];
hls.emit(Hls.Events.LEVELS_UPDATED, { levels: hls.levels });
assert.equal(hls.autoLevelCapping, 0, 'A 720p label alone is insufficient if its bitrate is too large');
hls.levels = [rendition(720, 5_000_000), rendition(1080, 3_500_000), rendition(2160, 8_000_000)];
hls.emit(Hls.Events.LEVELS_UPDATED);
assert.equal(hls.autoLevelCapping, 1, 'An over-budget master falls back to its lowest advertised bitrate');
hls.levels = [rendition(2160, 16_000_000)];
hls.emit(Hls.Events.LEVELS_UPDATED);
assert.equal(hls.autoLevelCapping, 0, 'Single-rendition streams must remain playable');
hls.levels = [{ bitrate: 600_000 }, { bitrate: 2_500_000 }, { bitrate: 3_000_000 }];
hls.emit(Hls.Events.LEVELS_UPDATED);
assert.equal(hls.autoLevelCapping, 1, 'Missing resolution still allows best-effort bandwidth savings');
hls.levels = [rendition(360, 500_000), rendition(720, 2_000_000, { maxBitrate: 3_000_000, averageBitrate: 1_000_000 })];
hls.emit(Hls.Events.LEVELS_UPDATED);
assert.equal(hls.autoLevelCapping, 0, 'Declared peak bitrate must not be hidden by a smaller average');
hls.levels = [rendition(360, 500_000), rendition(480, 4_000_000), rendition(720, 2_000_000)];
hls.emit(Hls.Events.LEVELS_UPDATED);
assert.equal(hls.autoLevelCapping, 0, 'A cap must not include an earlier expensive variant');
hls.levels = [{ width: 1920, height: 720, bitrate: 1_500_000 }, rendition(720, 2_000_000)];
hls.emit(Hls.Events.LEVELS_UPDATED);
assert.equal(hls.autoLevelCapping, 0, 'When every prefix is over-budget, retain the least expensive fallback');
hls.levels = [];
hls.emit(Hls.Events.LEVELS_UPDATED, { levels: [rendition(360, 500_000), rendition(720, 2_000_000)] });
assert.equal(hls.autoLevelCapping, 1, 'Event variants can supply the first available manifest');
cleanup();
hls.levels = [rendition(360, 500_000)];
hls.emit(Hls.Events.LEVELS_UPDATED);
assert.equal(hls.autoLevelCapping, 1, 'Cleanup must detach the policy listeners');
for (const mode of ['auto', 'original', 'invalid']) {
    const uncapped = new TestHls();
    uncapped.levels = [rendition(360, 500_000), rendition(2160, 18_000_000)];
    configureHlsPlayback(uncapped, Hls, mode);
    assert.equal(uncapped.autoLevelCapping, -1);
    assert.equal(uncapped.listeners.size, 0, 'Uncapped modes do not need manifest listeners');
}
assert.doesNotThrow(() => configureHlsPlayback(null, Hls, 'data-saver')());

console.log('Playback optimization tests passed.');
