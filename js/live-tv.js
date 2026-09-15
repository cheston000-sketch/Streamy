const STARTUP_TIMEOUT_MS = 10_000;

const state = {
    initialized: false,
    channels: [],
    categories: [],
    activeCategory: 'featured',
    query: '',
    activeChannel: null,
    activeStreamIndex: 0,
    hls: null,
    tuneTimer: null,
    tuneToken: 0,
    loading: false
};

const dom = {};

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getInitials(name = '') {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0])
        .join('')
        .toUpperCase() || 'TV';
}

function setGuideStatus(message, stateName = 'ready') {
    if (!dom.guideStatus) return;
    dom.guideStatus.textContent = message;
    dom.guideStatus.dataset.state = stateName;
}

function setPlayerMessage(icon, title, copy, visible = true) {
    if (!dom.playerMessage) return;
    dom.playerMessage.innerHTML = `
        <i class="fa-solid ${escapeHtml(icon)}" aria-hidden="true"></i>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(copy)}</span>
    `;
    dom.playerMessage.classList.toggle('hidden', !visible);
}

function updateClock() {
    if (!dom.clock) return;
    dom.clock.textContent = new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit'
    }).format(new Date());
}

function clearTuneTimer() {
    if (!state.tuneTimer) return;
    globalThis.clearTimeout(state.tuneTimer);
    state.tuneTimer = null;
}

function stopPlayback({ resetSelection = false } = {}) {
    state.tuneToken += 1;
    clearTuneTimer();
    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }
    if (dom.video) {
        dom.video.pause();
        dom.video.removeAttribute('src');
        dom.video.load();
    }
    dom.playerShell?.classList.remove('is-playing', 'has-error');
    if (resetSelection) {
        state.activeChannel = null;
        state.activeStreamIndex = 0;
    }
}

function updateNowPlaying(channel, streamIndex = 0) {
    if (!channel) return;
    const stream = channel.streams?.[streamIndex];
    if (dom.nowName) dom.nowName.textContent = channel.name;
    if (dom.nowMeta) {
        const network = channel.network ? `${channel.network} / ` : '';
        dom.nowMeta.textContent = `${network}${channel.categoryLabel || 'Live channel'} / ${stream?.quality || 'Auto'}`;
    }
    if (dom.nowLogo) {
        dom.nowLogo.innerHTML = channel.logo
            ? `<img src="${escapeHtml(channel.logo)}" alt="${escapeHtml(channel.name)} logo">`
            : `<span>${escapeHtml(getInitials(channel.name))}</span>`;
        dom.nowLogo.querySelector('img')?.addEventListener('error', () => {
            dom.nowLogo.innerHTML = `<span>${escapeHtml(getInitials(channel.name))}</span>`;
        }, { once: true });
    }
    if (dom.networkLink) {
        dom.networkLink.classList.toggle('hidden', !channel.website);
        if (channel.website) dom.networkLink.href = channel.website;
    }
}

function markActiveCard() {
    dom.channelGrid?.querySelectorAll('.live-channel-card').forEach(card => {
        const isActive = card.dataset.channelId === state.activeChannel?.id;
        card.classList.toggle('active', isActive);
        card.setAttribute('aria-pressed', String(isActive));
    });
}

function showPlaybackFailure(channel) {
    clearTuneTimer();
    dom.playerShell?.classList.add('has-error');
    setPlayerMessage(
        'fa-tower-broadcast',
        'Signal unavailable',
        `${channel.name} is not responding right now. Try another channel or open the network site.`
    );
    setGuideStatus(`Could not tune ${channel.name}.`, 'error');
}

function tryNextStream(channel, failedIndex, token) {
    if (token !== state.tuneToken || state.activeChannel?.id !== channel.id) return;
    const nextIndex = failedIndex + 1;
    if (nextIndex >= (channel.streams?.length || 0)) {
        showPlaybackFailure(channel);
        return;
    }
    setGuideStatus(`Primary signal missed. Trying backup ${nextIndex + 1}...`, 'loading');
    tuneChannel(channel, nextIndex);
}

function scheduleTuneTimeout(channel, streamIndex, token) {
    clearTuneTimer();
    state.tuneTimer = globalThis.setTimeout(() => {
        state.tuneTimer = null;
        if (token !== state.tuneToken) return;
        tryNextStream(channel, streamIndex, token);
    }, STARTUP_TIMEOUT_MS);
}

function beginVideoPlayback(channel, streamIndex, token) {
    if (token !== state.tuneToken) return;
    dom.video.volume = 1;
    dom.video.muted = false;
    const playPromise = dom.video.play();
    if (playPromise?.catch) {
        playPromise.catch(() => {
            if (token !== state.tuneToken) return;
            clearTuneTimer();
            setGuideStatus(`${channel.name} is ready. Press play to begin.`, 'ready');
            setPlayerMessage('fa-circle-play', 'Ready to watch', 'Press play in the video controls.');
        });
    }
    updateNowPlaying(channel, streamIndex);
}

function tuneWithHls(channel, streamIndex, token) {
    const stream = channel.streams[streamIndex];
    const HlsPlayer = globalThis.Hls;
    state.hls = new HlsPlayer({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 8,
        manifestLoadingTimeOut: 12_000,
        levelLoadingTimeOut: 12_000,
        fragLoadingTimeOut: 18_000
    });
    state.hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => beginVideoPlayback(channel, streamIndex, token));
    state.hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
        if (!data?.fatal || token !== state.tuneToken) return;
        tryNextStream(channel, streamIndex, token);
    });
    state.hls.loadSource(stream.url);
    state.hls.attachMedia(dom.video);
}

function tuneChannel(channel, streamIndex = 0) {
    stopPlayback();
    state.activeChannel = channel;
    state.activeStreamIndex = streamIndex;
    const token = state.tuneToken;
    const stream = channel.streams?.[streamIndex];
    markActiveCard();
    updateNowPlaying(channel, streamIndex);
    dom.playerShell?.classList.remove('has-error');
    setPlayerMessage('fa-satellite-dish', `Tuning ${channel.name}`, 'Locking onto the live signal...');
    setGuideStatus(`Tuning ${channel.name}...`, 'loading');

    if (!stream?.url) {
        showPlaybackFailure(channel);
        return;
    }

    scheduleTuneTimeout(channel, streamIndex, token);

    try {
        // Prefer Hls.js because some Chromium builds claim native HLS support
        // but leave the media element permanently stalled at readyState 0.
        if (globalThis.Hls?.isSupported?.()) {
            tuneWithHls(channel, streamIndex, token);
        } else if (dom.video.canPlayType('application/vnd.apple.mpegurl')) {
            dom.video.src = stream.url;
            dom.video.addEventListener('loadedmetadata', () => beginVideoPlayback(channel, streamIndex, token), { once: true });
            dom.video.addEventListener('error', () => tryNextStream(channel, streamIndex, token), { once: true });
        } else {
            showPlaybackFailure(channel);
        }
    } catch (error) {
        console.warn('[LiveTV] Unable to initialize stream:', error.message);
        tryNextStream(channel, streamIndex, token);
    }
}

function getVisibleChannels() {
    const query = state.query.toLowerCase();
    return state.channels.filter(channel => {
        const categoryMatch = state.activeCategory === 'all'
            || (state.activeCategory === 'featured' ? channel.featured : channel.category === state.activeCategory);
        const queryMatch = !query || [channel.name, channel.network, channel.categoryLabel, ...(channel.categories || [])]
            .filter(Boolean)
            .some(value => String(value).toLowerCase().includes(query));
        return categoryMatch && queryMatch;
    });
}

function renderCategoryFilters() {
    if (!dom.filters) return;
    const categories = [
        { id: 'all', label: 'All Channels', count: state.channels.length },
        ...state.categories
    ];
    dom.filters.innerHTML = categories.map(category => `
        <button class="live-filter${category.id === state.activeCategory ? ' active' : ''}"
            type="button" data-category="${escapeHtml(category.id)}" aria-pressed="${category.id === state.activeCategory}">
            <span>${escapeHtml(category.label)}</span>
            <small>${Number(category.count) || 0}</small>
        </button>
    `).join('');
    dom.filters.querySelectorAll('.live-filter').forEach(button => {
        button.addEventListener('click', () => {
            state.activeCategory = button.dataset.category || 'all';
            renderCategoryFilters();
            renderChannels();
        });
    });
}

function renderChannels() {
    if (!dom.channelGrid) return;
    const channels = getVisibleChannels();
    if (dom.channelCount) {
        dom.channelCount.textContent = `${channels.length} channel${channels.length === 1 ? '' : 's'}`;
    }
    if (!channels.length) {
        dom.channelGrid.innerHTML = `
            <div class="live-tv-empty-state">
                <i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i>
                <strong>No channels found</strong>
                <span>Try another category or search term.</span>
            </div>
        `;
        return;
    }

    dom.channelGrid.innerHTML = channels.map(channel => `
        <button class="live-channel-card${channel.id === state.activeChannel?.id ? ' active' : ''}"
            type="button" data-channel-id="${escapeHtml(channel.id)}" aria-pressed="${channel.id === state.activeChannel?.id}">
            <span class="live-channel-logo">
                ${channel.logo
                    ? `<img src="${escapeHtml(channel.logo)}" alt="" loading="lazy">`
                    : `<span>${escapeHtml(getInitials(channel.name))}</span>`}
            </span>
            <span class="live-channel-copy">
                <span class="live-channel-name">${escapeHtml(channel.name)}</span>
                <span class="live-channel-meta">${escapeHtml(channel.categoryLabel || 'Live TV')} / ${escapeHtml(channel.streams?.[0]?.quality || 'Auto')}</span>
            </span>
            <span class="live-channel-badge"><i></i> Live</span>
        </button>
    `).join('');

    dom.channelGrid.querySelectorAll('.live-channel-card').forEach(card => {
        const channel = state.channels.find(item => item.id === card.dataset.channelId);
        if (!channel) return;
        card.addEventListener('click', () => {
            tuneChannel(channel);
            dom.playerShell?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        card.querySelector('img')?.addEventListener('error', event => {
            event.currentTarget.parentElement.innerHTML = `<span>${escapeHtml(getInitials(channel.name))}</span>`;
        }, { once: true });
    });
}

function renderLoadingState() {
    if (!dom.channelGrid) return;
    dom.channelGrid.innerHTML = Array.from({ length: 10 }, () => `
        <div class="live-channel-card live-channel-skeleton" aria-hidden="true">
            <span class="live-channel-logo"></span>
            <span class="live-channel-copy"></span>
        </div>
    `).join('');
    if (dom.channelCount) dom.channelCount.textContent = 'Loading channels';
}

async function loadCatalog({ force = false } = {}) {
    if (state.loading || (state.channels.length && !force)) {
        renderCategoryFilters();
        renderChannels();
        return;
    }
    state.loading = true;
    renderLoadingState();
    setGuideStatus('Refreshing the live channel guide...', 'loading');

    try {
        const response = await fetch('/api/live-tv/channels', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Channel guide returned ${response.status}`);
        const data = await response.json();
        if (!data.success || !Array.isArray(data.channels)) throw new Error(data.error || 'Invalid channel guide');
        state.channels = data.channels;
        state.categories = Array.isArray(data.categories) ? data.categories : [];
        renderCategoryFilters();
        renderChannels();
        const warning = data.warning ? ` ${data.warning}` : '';
        setGuideStatus(`${state.channels.length} public channels ready.${warning}`, data.stale ? 'warning' : 'ready');

        if (!state.activeChannel) {
            state.activeChannel = state.channels.find(channel => channel.featured) || state.channels[0] || null;
            if (state.activeChannel) {
                updateNowPlaying(state.activeChannel);
                markActiveCard();
            }
        }
    } catch (error) {
        console.error('[LiveTV] Unable to load channel guide:', error);
        setGuideStatus('Live TV guide unavailable. Try again in a moment.', 'error');
        dom.channelGrid.innerHTML = `
            <button id="live-tv-retry" class="live-tv-empty-state live-tv-retry" type="button">
                <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
                <strong>Guide unavailable</strong>
                <span>Choose this card to retry.</span>
            </button>
        `;
        document.getElementById('live-tv-retry')?.addEventListener('click', () => loadCatalog({ force: true }));
    } finally {
        state.loading = false;
    }
}

async function requestFullscreen() {
    try {
        if (dom.playerShell?.requestFullscreen) {
            await dom.playerShell.requestFullscreen();
        } else if (dom.video?.webkitEnterFullscreen) {
            dom.video.webkitEnterFullscreen();
        }
    } catch (error) {
        console.warn('[LiveTV] Fullscreen request was declined:', error.message);
    }
}

export function initLiveTv() {
    if (state.initialized) return;
    dom.view = document.getElementById('view-live-tv');
    if (!dom.view) return;

    state.initialized = true;
    dom.video = document.getElementById('live-tv-player');
    dom.playerShell = document.getElementById('live-tv-player-shell');
    dom.playerMessage = document.getElementById('live-tv-player-message');
    dom.guideStatus = document.getElementById('live-tv-guide-status');
    dom.channelGrid = document.getElementById('live-tv-channel-grid');
    dom.channelCount = document.getElementById('live-tv-channel-count');
    dom.filters = document.getElementById('live-tv-filters');
    dom.search = document.getElementById('live-tv-search');
    dom.nowLogo = document.getElementById('live-tv-now-logo');
    dom.nowName = document.getElementById('live-tv-now-name');
    dom.nowMeta = document.getElementById('live-tv-now-meta');
    dom.networkLink = document.getElementById('live-tv-network-link');
    dom.fullscreenButton = document.getElementById('live-tv-fullscreen');
    dom.clock = document.getElementById('live-tv-clock');

    dom.search?.addEventListener('input', event => {
        state.query = event.target.value.trim();
        renderChannels();
    });
    dom.fullscreenButton?.addEventListener('click', requestFullscreen);
    dom.video?.addEventListener('playing', () => {
        clearTuneTimer();
        dom.playerShell?.classList.add('is-playing');
        dom.playerShell?.classList.remove('has-error');
        setPlayerMessage('', '', '', false);
        if (state.activeChannel) setGuideStatus(`${state.activeChannel.name} is on air.`, 'live');
    });
    dom.video?.addEventListener('waiting', () => {
        if (!state.activeChannel) return;
        setGuideStatus(`Buffering ${state.activeChannel.name}...`, 'loading');
    });

    globalThis.addEventListener('load-live-tv', () => {
        document.getElementById('genre-filter')?.classList.add('hidden');
        loadCatalog();
    });
    globalThis.addEventListener('hashchange', () => {
        if (!globalThis.location.hash.startsWith('#live-tv')) stopPlayback();
    });

    updateClock();
    globalThis.setInterval(updateClock, 30_000);
}
