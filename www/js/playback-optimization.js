const DATA_SAVER_MAX_BITRATE = 2_500_000;
const DATA_SAVER_MAX_WIDTH = 1280;
const DATA_SAVER_MAX_HEIGHT = 720;

export function normalizePlaybackOptimization(value) {
    return value === 'data-saver' || value === 'original' ? value : 'auto';
}

export function createHlsPlaybackConfig(mode) {
    const config = { enableWorker: true, capLevelToPlayerSize: false };
    if (normalizePlaybackOptimization(mode) === 'original') return config;

    Object.assign(config, {
        // Leave headroom for bandwidth fluctuations while retaining automatic quality.
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.65,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 40 * 1024 * 1024,
        backBufferLength: 30
    });
    return config;
}

function levelBitrate(level) {
    const bitrates = [level?.maxBitrate, level?.bitrate, level?.averageBitrate]
        .filter(value => Number.isFinite(value) && value > 0);
    return bitrates.length ? Math.max(...bitrates) : 0;
}

function fitsDataSaver(level) {
    const bitrate = levelBitrate(level);
    const width = Number(level?.width) || 0;
    const height = Number(level?.height) || 0;
    // Some masters omit RESOLUTION; their declared bandwidth is still useful.
    return bitrate > 0 && bitrate <= DATA_SAVER_MAX_BITRATE
        && width <= DATA_SAVER_MAX_WIDTH && height <= DATA_SAVER_MAX_HEIGHT;
}

function dataSaverLevelCap(levels) {
    if (!Array.isArray(levels) || !levels.length) return -1;

    // Hls caps an index prefix, not an arbitrary subset of variants. Stop at the
    // first over-budget variant so an earlier expensive level cannot leak through.
    let cap = -1;
    for (let index = 0; index < levels.length && fitsDataSaver(levels[index]); index += 1) {
        cap = index;
    }
    if (cap >= 0) return cap;

    // There may be only one large rendition. A cap cannot manufacture a smaller
    // one; keep playback possible with the lowest advertised bitrate available.
    let lowestIndex = 0;
    let lowestBitrate = Infinity;
    levels.forEach((level, index) => {
        const bitrate = levelBitrate(level);
        if (bitrate > 0 && bitrate < lowestBitrate) {
            lowestBitrate = bitrate;
            lowestIndex = index;
        }
    });
    return lowestIndex;
}

export function configureHlsPlayback(hls, HlsConstructor, mode) {
    if (normalizePlaybackOptimization(mode) !== 'data-saver' || !hls) return () => {};

    const updateCap = (_event, data) => {
        const levels = hls.levels?.length ? hls.levels : data?.levels;
        const cap = dataSaverLevelCap(levels);
        if (cap >= 0 && hls.autoLevelCapping !== cap) hls.autoLevelCapping = cap;
    };
    const events = [...new Set([
        HlsConstructor?.Events?.MANIFEST_PARSED,
        HlsConstructor?.Events?.LEVELS_UPDATED
    ].filter(Boolean))];
    if (typeof hls.on === 'function') events.forEach(event => hls.on(event, updateCap));
    updateCap();
    // Do not set currentLevel: the ABR controller must remain free to step down.
    return () => {
        if (typeof hls.off === 'function') events.forEach(event => hls.off(event, updateCap));
    };
}
