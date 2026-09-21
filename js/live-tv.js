import { buildBackendFetchOptions, getProxyHost } from './api.js?v=134';

const state = {
    initialized: false,
    channels: [],
    games: [],
    guideChannels: [],
    guideMeta: null,
    category: 'featured',
    query: '',
    mode: 'channels',
    activeChannel: null,
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

function showPlayerMessage(title, detail) {
    dom.videoEmpty?.classList.remove('hidden');
    if (dom.videoEmpty) {
        dom.videoEmpty.innerHTML = `<div><i class="fa-solid fa-tower-broadcast"></i><strong>${escapeHtml(title)}</strong><br>${escapeHtml(detail)}</div>`;
    }
}

function tryStream(channel, streamIndex, token) {
    if (token !== state.tuneToken) return;
    const source = channel.streams?.[streamIndex];
    if (!source) {
        showPlayerMessage('Signal unavailable', `Tellyvo tried every available signal for ${channel.name}.`);
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
        if (token !== state.tuneToken) return;
        tryStream(channel, streamIndex + 1, token);
    };

    if (dom.video.canPlayType('application/vnd.apple.mpegurl')) {
        dom.video.src = source.url;
        dom.video.onerror = fail;
    } else if (globalThis.Hls?.isSupported?.()) {
        state.hls = new globalThis.Hls({ enableWorker: true, lowLatencyMode: true });
        state.hls.loadSource(source.url);
        state.hls.attachMedia(dom.video);
        state.hls.on(globalThis.Hls.Events.ERROR, (_event, data) => {
            if (data?.fatal) fail();
        });
    } else {
        dom.video.src = source.url;
        dom.video.onerror = fail;
    }

    dom.video.play().then(() => dom.videoEmpty?.classList.add('hidden')).catch(() => {
        showPlayerMessage('Press play to start', `${channel.name} is ready.`);
    });
}

function tuneChannel(channel) {
    if (!channel?.streams?.length) return;
    state.activeChannel = channel;
    state.streamIndex = 0;
    const token = ++state.tuneToken;
    dom.nowTitle.textContent = channel.name;
    dom.nowMeta.textContent = `${channel.network ? `${channel.network} · ` : ''}${channel.categoryLabel || 'Live channel'} · Live now`;
    showPlayerMessage('Tuning channel', `Connecting to ${channel.name}...`);
    tryStream(channel, 0, token);
    dom.channelGrid.querySelectorAll('.live-card').forEach(card => {
        const active = card.dataset.channelId === channel.id;
        card.classList.toggle('active', active);
        card.setAttribute('aria-pressed', String(active));
    });
}

function channelMatches(channel) {
    const categoryMatch = state.category === 'all'
        || (state.category === 'featured' && channel.featured)
        || channel.category === state.category
        || channel.categories?.includes(state.category);
    if (!categoryMatch) return false;
    if (!state.query) return true;
    const haystack = `${channel.name} ${channel.network || ''} ${channel.categoryLabel || ''}`.toLowerCase();
    return haystack.includes(state.query);
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
            renderChannels();
        };
        dom.categories.appendChild(button);
    });
}

function renderChannels() {
    const channels = state.channels.filter(channelMatches);
    dom.channelGrid.innerHTML = '';
    if (!channels.length) {
        dom.channelGrid.innerHTML = '<div class="live-state"><i class="fa-solid fa-satellite-dish"></i><h2>No channels found</h2><p>Try another category or search.</p></div>';
        return;
    }
    const fragment = document.createDocumentFragment();
    channels.forEach(channel => {
        const card = document.createElement('button');
        card.className = 'live-card';
        card.dataset.channelId = channel.id;
        card.setAttribute('aria-pressed', String(channel.id === state.activeChannel?.id));
        card.innerHTML = `
            <span class="live-badge">LIVE</span>
            ${channel.logo
                ? `<img class="live-card-logo" src="${escapeHtml(channel.logo)}" alt="" loading="lazy">`
                : `<span class="live-card-logo">${escapeHtml(getInitials(channel.name))}</span>`}
            <span><h3>${escapeHtml(channel.name)}</h3><span class="live-card-meta">${escapeHtml(channel.categoryLabel || channel.network || 'Live channel')}</span></span>`;
        card.onclick = () => tuneChannel(channel);
        fragment.appendChild(card);
    });
    dom.channelGrid.appendChild(fragment);
}

function formatGameTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Time TBA';
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

function renderGames() {
    dom.guide.innerHTML = '';
    const programs = state.guideChannels
        .flatMap(channel => (channel.programs || []).map(program => ({ ...program, channel: state.channels.find(item => item.id === channel.id) })))
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    if (programs.length) {
        const fragment = document.createDocumentFragment();
        programs.slice(0, 160).forEach(program => {
            const card = document.createElement('button');
            card.className = 'game-card';
            card.innerHTML = `
                <span><span class="game-time">${escapeHtml(formatGameTime(program.startsAt))}</span><br><span class="game-league">${escapeHtml(program.channel?.name || program.channelId)}</span></span>
                <span><strong>${escapeHtml(program.title)}</strong><br><span class="live-card-meta">${escapeHtml(program.synopsis || 'Live program')}</span></span>
                <span class="btn-secondary">Watch</span>`;
            card.onclick = () => program.channel && tuneChannel(program.channel);
            fragment.appendChild(card);
        });
        dom.guide.appendChild(fragment);
        if (state.guideMeta?.stale) {
            dom.guide.insertAdjacentHTML('afterbegin', `<div class="live-state">Schedule last updated ${escapeHtml(new Date(state.guideMeta.lastUpdated).toLocaleString())}</div>`);
        }
        return;
    }
    const games = state.games.slice().sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    if (!games.length) {
        dom.guide.innerHTML = '<div class="live-state"><i class="fa-solid fa-calendar-days"></i><h2>No scheduled games</h2><p>The live sports guide will update automatically.</p></div>';
        return;
    }
    const fragment = document.createDocumentFragment();
    games.slice(0, 120).forEach(game => {
        const card = document.createElement('button');
        card.className = 'game-card';
        const status = game.status?.detail || 'Scheduled';
        card.innerHTML = `
            <span><span class="game-time">${escapeHtml(formatGameTime(game.startTime))}</span><br><span class="game-league">${escapeHtml(game.league?.label || '')}</span></span>
            <span><strong>${escapeHtml(game.fullTitle || game.title)}</strong><br><span class="live-card-meta">${escapeHtml((game.viewing?.networks || game.broadcasts || []).join(' · ') || status)}</span></span>
            <span class="btn-secondary">${escapeHtml(status)}</span>`;
        card.onclick = () => {
            const ids = new Set((game.viewing?.channels || []).map(item => item.id || item.channelId).filter(Boolean));
            const matching = state.channels.find(channel => ids.has(channel.id));
            if (matching) tuneChannel(matching);
            else {
                dom.nowTitle.textContent = game.fullTitle || game.title;
                dom.nowMeta.textContent = (game.viewing?.networks || []).join(' · ') || 'No matching free channel is available for this event.';
            }
        };
        fragment.appendChild(card);
    });
    dom.guide.appendChild(fragment);
}

function setMode(mode) {
    state.mode = mode;
    const channelsMode = mode === 'channels';
    dom.channelGrid.classList.toggle('hidden', !channelsMode);
    dom.guide.classList.toggle('hidden', channelsMode);
    dom.channelsTab.classList.toggle('active', channelsMode);
    dom.guideTab.classList.toggle('active', !channelsMode);
    dom.channelsTab.setAttribute('aria-selected', String(channelsMode));
    dom.guideTab.setAttribute('aria-selected', String(!channelsMode));
    dom.categories.classList.toggle('hidden', !channelsMode);
    dom.search.placeholder = channelsMode ? 'Search channels...' : 'Search the sports guide...';
    if (channelsMode) renderChannels(); else renderGames();
}

async function loadLiveData(force = false) {
    dom.channelGrid.innerHTML = '<div class="live-state"><i class="fa-solid fa-spinner fa-spin"></i><h2>Loading live channels</h2><p>Connecting to the Tellyvo channel guide...</p></div>';
    try {
        const options = buildBackendFetchOptions(getProxyHost(), { cache: force ? 'reload' : 'no-store' });
        const [channelsResponse, gamesResponse] = await Promise.all([
            fetch(endpoint('/api/live-tv/channels'), options),
            fetch(endpoint('/api/live-tv/games'), options).catch(() => null)
        ]);
        if (!channelsResponse.ok) throw new Error(`Channel service returned ${channelsResponse.status}`);
        const channelsPayload = await channelsResponse.json();
        const gamesPayload = gamesResponse?.ok ? await gamesResponse.json() : { games: [] };
        state.channels = Array.isArray(channelsPayload.channels) ? channelsPayload.channels : [];
        state.games = Array.isArray(gamesPayload.games) ? gamesPayload.games : [];
        try {
            const from = new Date();
            const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
            const ids = state.channels.map(channel => channel.id).slice(0, 100).join(',');
            const guideResponse = await fetch(endpoint(`/api/live-tv/guide?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&channelIds=${encodeURIComponent(ids)}`), options);
            if (guideResponse.ok) {
                const guidePayload = await guideResponse.json();
                state.guideChannels = Array.isArray(guidePayload.channels) ? guidePayload.channels : [];
                state.guideMeta = guidePayload;
            }
        } catch (error) {
            console.warn('[Live TV] EPG unavailable; using sports schedule fallback:', error.message);
        }
        renderCategories();
        renderChannels();
        renderGames();
    } catch (error) {
        console.warn('[Live TV] Unable to load:', error.message);
        dom.channelGrid.innerHTML = `<div class="live-state"><i class="fa-solid fa-triangle-exclamation"></i><h2>Live TV is temporarily unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
    }
}

export function initLiveTv() {
    if (state.initialized) return;
    state.initialized = true;
    Object.assign(dom, {
        video: document.getElementById('live-video'),
        videoEmpty: document.getElementById('live-video-empty'),
        nowTitle: document.getElementById('live-now-title'),
        nowMeta: document.getElementById('live-now-meta'),
        channelsTab: document.getElementById('live-channels-tab'),
        guideTab: document.getElementById('live-guide-tab'),
        search: document.getElementById('live-search-input'),
        refresh: document.getElementById('live-refresh-btn'),
        categories: document.getElementById('live-categories'),
        channelGrid: document.getElementById('live-channel-grid'),
        guide: document.getElementById('sports-guide')
    });
    if (!dom.channelGrid) return;
    dom.channelsTab.onclick = () => setMode('channels');
    dom.guideTab.onclick = () => setMode('guide');
    dom.search.oninput = () => {
        state.query = dom.search.value.trim().toLowerCase();
        if (state.mode === 'channels') renderChannels();
        else {
            const query = state.query;
            const original = state.games;
            state.games = original.filter(game => `${game.fullTitle || game.title} ${game.league?.label || ''}`.toLowerCase().includes(query));
            renderGames();
            state.games = original;
        }
    };
    dom.refresh.onclick = () => loadLiveData(true);
    globalThis.addEventListener('load-live-tv', () => {
        if (!state.channels.length) loadLiveData();
    });
    globalThis.addEventListener('hashchange', () => {
        if (!globalThis.location.hash.startsWith('#live-tv')) stopLivePlayback();
    });
}
