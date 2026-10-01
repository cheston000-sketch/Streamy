import { buildBackendFetchOptions, getProxyHost } from './api.js?v=140';

const state = {
    initialized: false,
    channels: [],
    guideChannels: [],
    guideMeta: null,
    category: 'featured',
    query: '',
    mode: 'channels',
    activeChannel: null,
    previewChannel: null,
    streamIndex: 0,
    tuneToken: 0,
    hls: null
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

function endpoint(path) {
    return `${getProxyHost()}${path}`;
}

function getInitials(value = '') {
    return String(value).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'TV';
}

function isNativeTvApp() {
    try {
        return globalThis.NativeBridge?.isNative?.() === true;
    } catch (error) {
        return !!globalThis.NativeBridge;
    }
}

function getChannelPrograms(channelId) {
    return state.guideChannels.find(channel => channel.id === channelId)?.programs || [];
}

function getCurrentAndNextPrograms(channelId) {
    const now = Date.now();
    const programs = getChannelPrograms(channelId);
    const currentIndex = programs.findIndex(program => Date.parse(program.startsAt) <= now && Date.parse(program.endsAt) > now);
    return {
        current: currentIndex >= 0 ? programs[currentIndex] : null,
        next: currentIndex >= 0 ? programs[currentIndex + 1] || null : programs.find(program => Date.parse(program.startsAt) > now) || null
    };
}

function formatTime(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
        : '';
}

function stopLivePlayback() {
    state.tuneToken += 1;
    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }
    if (dom.video) {
        dom.video.pause();
        dom.video.removeAttribute('src');
        dom.video.load();
    }
}

function showPlayerMessage(title, detail, icon = 'fa-tower-broadcast') {
    dom.videoEmpty?.classList.remove('hidden');
    if (dom.videoEmpty) {
        dom.videoEmpty.innerHTML = `<div><i class="fa-solid ${icon}"></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`;
    }
}

function previewChannel(channel) {
    if (!channel) return;
    state.previewChannel = channel;
    const { current, next } = getCurrentAndNextPrograms(channel.id);
    dom.nowTitle.textContent = current?.title || channel.name;
    dom.nowMeta.textContent = current
        ? `${channel.name} · ${formatTime(current.startsAt)}–${formatTime(current.endsAt)}`
        : `${channel.network ? `${channel.network} · ` : ''}${channel.categoryLabel || 'Live channel'}`;
    dom.nowNext.textContent = next
        ? `Up next at ${formatTime(next.startsAt)} · ${next.title}`
        : 'Press Select to watch live';
    if (channel.logo) {
        dom.previewLogo.src = channel.logo;
        dom.previewLogo.alt = `${channel.name} logo`;
        dom.previewLogo.classList.remove('hidden');
        dom.previewLogo.onerror = () => dom.previewLogo.classList.add('hidden');
    } else {
        dom.previewLogo.removeAttribute('src');
        dom.previewLogo.alt = '';
        dom.previewLogo.classList.add('hidden');
    }
}

function tryWebStream(channel, streamIndex, token) {
    if (token !== state.tuneToken) return;
    const source = channel.streams?.[streamIndex];
    if (!source) {
        showPlayerMessage('Signal unavailable', `No working direct signal was found for ${channel.name}.`, 'fa-satellite-dish');
        return;
    }

    state.streamIndex = streamIndex;
    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }
    dom.video.pause();
    dom.video.removeAttribute('src');
    dom.video.load();

    const fail = () => {
        if (token === state.tuneToken) tryWebStream(channel, streamIndex + 1, token);
    };

    if (globalThis.Hls?.isSupported?.()) {
        state.hls = new globalThis.Hls({ enableWorker: true, lowLatencyMode: true, liveDurationInfinity: true });
        state.hls.loadSource(source.url);
        state.hls.attachMedia(dom.video);
        state.hls.on(globalThis.Hls.Events.ERROR, (_event, data) => {
            if (data?.fatal) fail();
        });
    } else if (dom.video.canPlayType('application/vnd.apple.mpegurl')) {
        dom.video.src = source.url;
        dom.video.onerror = fail;
    } else {
        fail();
        return;
    }

    dom.video.play()
        .then(() => dom.videoEmpty?.classList.add('hidden'))
        .catch(() => showPlayerMessage('Ready to play', `Use the video play control to start ${channel.name}.`, 'fa-play'));
}

function launchNativeChannel(channel) {
    const source = channel.streams?.[0];
    if (!source || !globalThis.NativeBridge) return false;
    const sources = channel.streams.map((stream, index) => ({
        server: `${channel.name} signal ${index + 1}`,
        url: stream.url,
        type: 'hls',
        referer: '',
        origin: '',
        cookie: ''
    }));
    const sourceJson = JSON.stringify(sources);
    if (typeof globalThis.NativeBridge.playStreamWithContext === 'function') {
        globalThis.NativeBridge.playStreamWithContext(
            source.url,
            'application/x-mpegURL',
            channel.name,
            `live:${channel.id}`,
            '0',
            '',
            '',
            '',
            sourceJson,
            '0',
            '0',
            '0',
            'false'
        );
        return true;
    }
    if (typeof globalThis.NativeBridge.playStream === 'function') {
        globalThis.NativeBridge.playStream(source.url, 'application/x-mpegURL', channel.name);
        return true;
    }
    return false;
}

function tuneChannel(channel) {
    if (!channel?.streams?.length) return;
    state.activeChannel = channel;
    previewChannel(channel);
    dom.channelGrid.querySelectorAll('.live-card').forEach(card => {
        const active = card.dataset.channelId === channel.id;
        card.classList.toggle('active', active);
        card.setAttribute('aria-pressed', String(active));
    });
    if (isNativeTvApp() && launchNativeChannel(channel)) return;

    state.streamIndex = 0;
    const token = ++state.tuneToken;
    showPlayerMessage('Tuning channel', `Connecting to ${channel.name}...`);
    tryWebStream(channel, 0, token);
}

function channelMatches(channel) {
    const categoryMatch = state.category === 'all'
        || channel.category === state.category
        || channel.categories?.includes(state.category);
    if (!categoryMatch) return false;
    if (!state.query) return true;
    const { current } = getCurrentAndNextPrograms(channel.id);
    return `${channel.name} ${channel.network || ''} ${channel.categoryLabel || ''} ${current?.title || ''}`
        .toLowerCase()
        .includes(state.query);
}

function visibleChannels() {
    if (state.category === 'featured') {
        const featured = state.channels.slice(0, 12);
        if (!state.query) return featured;
        return featured.filter(channel => {
            const { current } = getCurrentAndNextPrograms(channel.id);
            return `${channel.name} ${channel.network || ''} ${channel.categoryLabel || ''} ${current?.title || ''}`
                .toLowerCase().includes(state.query);
        });
    }
    return state.channels.filter(channelMatches);
}

function renderCategories() {
    const values = new Map([['featured', 'Featured'], ['all', 'All Channels']]);
    state.channels.forEach(channel => {
        if (channel.category) values.set(channel.category, channel.categoryLabel || channel.category);
    });
    dom.categories.innerHTML = '';
    values.forEach((label, value) => {
        const button = document.createElement('button');
        button.className = `btn-secondary live-chip${state.category === value ? ' active' : ''}`;
        button.tabIndex = 0;
        button.textContent = label;
        button.setAttribute('aria-pressed', String(state.category === value));
        button.onclick = () => {
            state.category = value;
            renderCategories();
            renderChannels({ claimFocus: true });
        };
        dom.categories.appendChild(button);
    });
}

function renderLiveState({ icon, title, detail, actionLabel = '', onAction = null }) {
    dom.channelGrid.innerHTML = `
        <div class="live-state">
            <i class="fa-solid ${escapeHtml(icon)}"></i>
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(detail)}</p>
            ${actionLabel ? `<button class="btn-secondary live-state-action" tabindex="0">${escapeHtml(actionLabel)}</button>` : ''}
        </div>`;
    if (onAction) dom.channelGrid.querySelector('.live-state-action')?.addEventListener('click', onAction);
}

function renderChannels({ claimFocus = false } = {}) {
    const channels = visibleChannels();
    dom.channelGrid.innerHTML = '';
    dom.channelCount.textContent = `${channels.length} direct channel${channels.length === 1 ? '' : 's'}`;
    if (!channels.length) {
        renderLiveState({ icon: 'fa-satellite-dish', title: 'No channels found', detail: 'Try another category or clear the search.' });
        return;
    }

    const fragment = document.createDocumentFragment();
    channels.forEach(channel => {
        const { current, next } = getCurrentAndNextPrograms(channel.id);
        const card = document.createElement('button');
        card.className = 'live-card';
        card.dataset.channelId = channel.id;
        card.setAttribute('aria-pressed', String(channel.id === state.activeChannel?.id));
        card.setAttribute('aria-label', `${channel.name}. ${current?.title || channel.categoryLabel || 'Live channel'}. Press Select to watch.`);
        card.innerHTML = `
            <span class="live-badge">LIVE</span>
            <span class="live-card-brand">
                ${channel.logo
                    ? `<img class="live-card-logo" src="${escapeHtml(channel.logo)}" alt="" loading="lazy">`
                    : `<span class="live-card-logo live-card-initials">${escapeHtml(getInitials(channel.name))}</span>`}
                <span class="live-card-quality">${escapeHtml(channel.streams[0]?.quality || 'Auto')}</span>
            </span>
            <span class="live-card-copy">
                <h3>${escapeHtml(channel.name)}</h3>
                <span class="live-card-program">${escapeHtml(current?.title || channel.categoryLabel || 'Live channel')}</span>
                <span class="live-card-next">${escapeHtml(next ? `Next · ${next.title}` : 'Select to watch')}</span>
            </span>`;
        card.querySelector('img')?.addEventListener('error', event => {
            const fallback = document.createElement('span');
            fallback.className = 'live-card-logo live-card-initials';
            fallback.textContent = getInitials(channel.name);
            event.currentTarget.replaceWith(fallback);
        }, { once: true });
        card.addEventListener('focus', () => previewChannel(channel));
        card.onclick = () => tuneChannel(channel);
        fragment.appendChild(card);
    });
    dom.channelGrid.appendChild(fragment);

    const active = document.activeElement;
    const focusIsUnclaimed = !active || active === document.body || active.closest?.('.hidden');
    if ((claimFocus || focusIsUnclaimed) && globalThis.location.hash.startsWith('#live-tv')) {
        requestAnimationFrame(() => dom.channelGrid.querySelector('.live-card')?.focus());
    }
    if (!state.previewChannel || !channels.some(channel => channel.id === state.previewChannel.id)) {
        previewChannel(channels[0]);
    }
}

function renderGuide() {
    dom.guide.innerHTML = '';
    const now = Date.now();
    const rows = state.channels.map(channel => {
        const programs = getChannelPrograms(channel.id);
        const upcoming = programs.filter(program => Date.parse(program.endsAt) > now).slice(0, 3);
        return {
            channel,
            scheduled: upcoming.length > 0,
            programs: upcoming.length ? upcoming : [{ title: 'Live now', startsAt: new Date(now).toISOString() }]
        };
    }).filter(row => {
        if (!state.query) return true;
        return `${row.channel.name} ${row.programs.map(program => program.title).join(' ')}`.toLowerCase().includes(state.query);
    });

    dom.channelCount.textContent = `${rows.length} schedules`;
    if (!rows.length) {
        dom.guide.innerHTML = '<div class="live-state"><i class="fa-solid fa-calendar-days"></i><h2>Guide data is updating</h2><p>Channels are still available in the Channels view.</p></div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    rows.slice(0, 80).forEach(({ channel, programs, scheduled }) => {
        const card = document.createElement('button');
        card.className = 'game-card';
        card.setAttribute('aria-label', `${channel.name}. ${programs[0].title}. Press Select to watch live.`);
        card.innerHTML = `
            <span class="guide-channel">${channel.logo ? `<img src="${escapeHtml(channel.logo)}" alt="">` : escapeHtml(getInitials(channel.name))}<strong>${escapeHtml(channel.name)}</strong></span>
            <span class="guide-programs">${programs.map((program, index) => `
                <span class="guide-program${index === 0 ? ' current' : ''}">
                    <span class="game-time">${escapeHtml(scheduled ? formatTime(program.startsAt) : 'Now')}</span>
                    <strong>${escapeHtml(program.title)}</strong>
                </span>`).join('')}</span>
            <span class="guide-watch">Watch</span>`;
        card.addEventListener('focus', () => previewChannel(channel));
        card.querySelector('img')?.addEventListener('error', event => event.currentTarget.classList.add('hidden'), { once: true });
        card.onclick = () => tuneChannel(channel);
        fragment.appendChild(card);
    });
    dom.guide.appendChild(fragment);
}

function setMode(mode, { claimFocus = false } = {}) {
    state.mode = mode;
    const channelsMode = mode === 'channels';
    dom.channelGrid.classList.toggle('hidden', !channelsMode);
    dom.guide.classList.toggle('hidden', channelsMode);
    dom.channelsTab.classList.toggle('active', channelsMode);
    dom.guideTab.classList.toggle('active', !channelsMode);
    dom.channelsTab.setAttribute('aria-selected', String(channelsMode));
    dom.guideTab.setAttribute('aria-selected', String(!channelsMode));
    dom.categories.classList.toggle('hidden', !channelsMode);
    dom.search.placeholder = channelsMode ? 'Search channels or programs' : 'Search guide';
    if (channelsMode) {
        renderChannels({ claimFocus });
    } else {
        renderGuide();
        if (claimFocus) requestAnimationFrame(() => dom.guide.querySelector('.game-card')?.focus());
    }
}

async function loadGuide(options) {
    const ids = state.channels.slice(0, 80).map(channel => channel.id).join(',');
    if (!ids) return;
    try {
        const from = new Date();
        const to = new Date(from.getTime() + 12 * 60 * 60 * 1000);
        const guideResponse = await fetch(endpoint(`/api/live-tv/guide?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&channelIds=${encodeURIComponent(ids)}`), options);
        if (!guideResponse.ok) return;
        const guidePayload = await guideResponse.json();
        state.guideChannels = Array.isArray(guidePayload.channels) ? guidePayload.channels : [];
        state.guideMeta = guidePayload;
        renderChannels();
        if (state.previewChannel) previewChannel(state.previewChannel);
        if (state.mode === 'guide') renderGuide();
    } catch (error) {
        console.warn('[Live TV] Guide unavailable:', error.message);
    }
}

async function loadLiveData(force = false) {
    renderLiveState({ icon: 'fa-spinner fa-spin', title: 'Loading direct channels', detail: 'Checking web-compatible live signals…' });
    dom.channelCount.textContent = 'Loading';
    try {
        const options = buildBackendFetchOptions(getProxyHost(), { cache: force ? 'reload' : 'no-store' });
        const response = await fetch(endpoint('/api/live-tv/channels?country=US&limit=48'), options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'The channel catalog could not be loaded.');
        state.channels = Array.isArray(payload.channels)
            ? payload.channels.filter(channel => channel.webVerified === true && Array.isArray(channel.streams) && channel.streams.length)
            : [];
        if (!state.channels.length) throw new Error('No direct channels are available right now.');
        renderCategories();
        setMode(state.mode, { claimFocus: true });
        loadGuide(options);
    } catch (error) {
        console.warn('[Live TV] Unable to load:', error.message);
        renderLiveState({
            icon: 'fa-triangle-exclamation',
            title: 'Live TV is taking a break',
            detail: 'Tellyvo could not reach the direct channel catalog. Check your connection and try again.',
            actionLabel: 'Try Again',
            onAction: () => loadLiveData(true)
        });
        dom.channelCount.textContent = 'Unavailable';
    }
}

export function initLiveTv() {
    if (state.initialized) return;
    state.initialized = true;
    Object.assign(dom, {
        video: document.getElementById('live-video'),
        videoEmpty: document.getElementById('live-video-empty'),
        previewLogo: document.getElementById('live-preview-logo'),
        nowTitle: document.getElementById('live-now-title'),
        nowMeta: document.getElementById('live-now-meta'),
        nowNext: document.getElementById('live-now-next'),
        channelCount: document.getElementById('live-channel-count'),
        channelsTab: document.getElementById('live-channels-tab'),
        guideTab: document.getElementById('live-guide-tab'),
        search: document.getElementById('live-search-input'),
        refresh: document.getElementById('live-refresh-btn'),
        categories: document.getElementById('live-categories'),
        channelGrid: document.getElementById('live-channel-grid'),
        guide: document.getElementById('sports-guide')
    });
    if (!dom.channelGrid) return;
    dom.channelsTab.onclick = () => setMode('channels', { claimFocus: true });
    dom.guideTab.onclick = () => setMode('guide', { claimFocus: true });
    dom.search.oninput = () => {
        state.query = dom.search.value.trim().toLowerCase();
        if (state.mode === 'channels') renderChannels();
        else renderGuide();
    };
    dom.refresh.onclick = () => loadLiveData(true);
    globalThis.addEventListener('load-live-tv', () => {
        if (!state.channels.length) loadLiveData();
        else setMode(state.mode);
    });
    globalThis.addEventListener('hashchange', () => {
        if (!globalThis.location.hash.startsWith('#live-tv')) stopLivePlayback();
    });
}
