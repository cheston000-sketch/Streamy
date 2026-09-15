const STARTUP_TIMEOUT_MS = 10_000;

const state = {
    initialized: false,
    channels: [],
    categories: [],
    activeCategory: 'featured',
    query: '',
    activeChannel: null,
    activeStreamIndex: 0,
    games: [],
    gameLeagues: [],
    gameQuery: '',
    gameWindow: 'today',
    activeGameLeague: 'all',
    gamesLoading: false,
    gamesLoaded: false,
    gameDateWindow: null,
    enrichingGames: new Set(),
    enrichedGames: new Set(),
    failedGames: new Set(),
    gameEnrichmentRenderTimer: null,
    hls: null,
    tuneTimer: null,
    tuneToken: 0,
    loading: false
};

const dom = {};

const GAME_CHANNEL_IDS_BY_NETWORK = new Map([
    ['cbs sports golazo network', 'CBSSportsGolazoNetwork.us'],
    ['cbs sports hq', 'CBSSportsHQ.us'],
    ['nbc sports now', 'NBCSportsNOW.us'],
    ['nhl network', 'NHLNetwork.us'],
    ['tennis channel', 'TennisChannel.us'],
    ['fifa plus', 'FIFAPlus.uk'],
    ['fifa plus women', 'FIFAPlusWomen.uk'],
    ['bein sports xtra', 'beINSPORTSXTRA.us'],
    ['pga tour', 'PGATour.us'],
    ['womens sports network', 'WomensSportsNetwork.us'],
    ['fight network', 'FightNetwork.ca'],
    ['fite 24 7', 'FITE247.us'],
    ['draftkings network', 'DraftKingsNetwork.us'],
    ['sportsgrid', 'SportsGrid.us'],
    ['lacrosse tv', 'LacrosseTV.us']
]);

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

function setGameStatus(message, stateName = 'ready') {
    if (!dom.gameStatus) return;
    dom.gameStatus.textContent = message;
    dom.gameStatus.dataset.state = stateName;
}

function isSameLocalDay(date, comparison) {
    return date.getFullYear() === comparison.getFullYear()
        && date.getMonth() === comparison.getMonth()
        && date.getDate() === comparison.getDate();
}

function formatGameStart(startTime, { compact = false } = {}) {
    const date = new Date(startTime);
    if (!Number.isFinite(date.getTime())) return 'Time pending';
    return new Intl.DateTimeFormat(undefined, compact ? {
        hour: 'numeric',
        minute: '2-digit'
    } : {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

function getGameStatusLabel(game) {
    if (game.status?.state === 'live') return game.status.detail || 'Live now';
    if (game.status?.state === 'final') return game.status.detail || 'Final';
    const start = new Date(game.startTime);
    return Number.isFinite(start.getTime()) && isSameLocalDay(start, new Date())
        ? `Today ${formatGameStart(game.startTime, { compact: true })}`
        : formatGameStart(game.startTime);
}

function getVisibleGames() {
    const queryTokens = state.gameQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));

    return state.games.filter(game => {
        if (state.activeGameLeague !== 'all' && game.league?.id !== state.activeGameLeague) return false;

        const searchable = [
            game.title,
            game.fullTitle,
            game.league?.label,
            game.venue?.name,
            game.venue?.location,
            ...(game.broadcasts || []),
            ...(game.competitors || []).flatMap(competitor => [competitor.name, competitor.shortName, competitor.abbreviation])
        ].filter(Boolean).join(' ').toLowerCase();
        if (queryTokens.length && !queryTokens.every(token => searchable.includes(token))) return false;

        const start = new Date(game.startTime);
        if (!Number.isFinite(start.getTime())) return state.gameWindow === 'all';
        if (state.gameWindow === 'live') return game.status?.state === 'live';
        if (state.gameWindow === 'today') return isSameLocalDay(start, now);
        if (state.gameWindow === 'week') {
            return game.status?.state !== 'final' && start <= weekFromNow && start >= new Date(now.getTime() - (6 * 60 * 60 * 1000));
        }
        return true;
    });
}

function renderGameWindowFilters() {
    if (!dom.gameWindows) return;
    const liveCount = state.games.filter(game => game.status?.state === 'live').length;
    if (dom.liveGameCount) dom.liveGameCount.textContent = String(liveCount);
    dom.gameWindows.querySelectorAll('button[data-window]').forEach(button => {
        const isActive = button.dataset.window === state.gameWindow;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

function renderGameLeagueFilters() {
    if (!dom.gameLeagueFilters) return;
    const filters = [
        { id: 'all', label: 'All leagues', count: state.games.length },
        ...state.gameLeagues
    ];
    dom.gameLeagueFilters.innerHTML = filters.map(league => `
        <button type="button" class="sports-league-filter${league.id === state.activeGameLeague ? ' active' : ''}"
            data-league="${escapeHtml(league.id)}" aria-pressed="${league.id === state.activeGameLeague}">
            <span>${escapeHtml(league.label)}</span><small>${Number(league.count) || 0}</small>
        </button>
    `).join('');
    dom.gameLeagueFilters.querySelectorAll('.sports-league-filter').forEach(button => {
        button.addEventListener('click', () => {
            state.activeGameLeague = button.dataset.league || 'all';
            renderGameLeagueFilters();
            renderGames();
        });
    });
}

function renderGameTeam(competitor, showScore) {
    const fallback = getInitials(competitor.shortName || competitor.name);
    return `
        <div class="sports-game-team${competitor.winner ? ' winner' : ''}">
            <span class="sports-game-team-logo">
                ${competitor.logo
                    ? `<img src="${escapeHtml(competitor.logo)}" alt="" loading="lazy">`
                    : `<span>${escapeHtml(fallback)}</span>`}
            </span>
            <span class="sports-game-team-copy">
                <strong>${escapeHtml(competitor.shortName || competitor.name)}</strong>
                <small>${escapeHtml(competitor.homeAway === 'home' ? 'Home' : competitor.homeAway === 'away' ? 'Away' : '')}</small>
            </span>
            ${showScore ? `<b>${escapeHtml(competitor.score || '-')}</b>` : ''}
        </div>
    `;
}

function renderGameActions(game) {
    const channel = game.viewing?.channels?.[0];
    const provider = game.viewing?.providers?.[0];
    const isLive = game.status?.state === 'live';
    const actions = [];

    if (channel) {
        actions.push(`
            <button type="button" class="sports-game-action primary" data-channel-id="${escapeHtml(channel.id)}">
                <i class="fa-solid fa-play" aria-hidden="true"></i>
                ${isLive ? 'Watch now' : `Open ${escapeHtml(channel.name)}`}
            </button>
        `);
    } else if (provider) {
        actions.push(`
            <a class="sports-game-action primary" href="${escapeHtml(provider.url)}" target="_blank" rel="noopener noreferrer">
                <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                ${isLive ? `Watch on ${escapeHtml(provider.name)}` : `Open ${escapeHtml(provider.name)}`}
            </a>
        `);
    }

    if (channel && provider) {
        actions.push(`
            <a class="sports-game-action secondary" href="${escapeHtml(provider.url)}" target="_blank" rel="noopener noreferrer"
                aria-label="Open ${escapeHtml(provider.name)}">
                <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
            </a>
        `);
    } else if (game.detailsUrl) {
        actions.push(`
            <a class="sports-game-action secondary" href="${escapeHtml(game.detailsUrl)}" target="_blank" rel="noopener noreferrer"
                aria-label="Open game details">
                <i class="fa-solid fa-chart-simple" aria-hidden="true"></i>
            </a>
        `);
    }

    if (!actions.length) {
        return '<span class="sports-game-coverage-pending"><i class="fa-regular fa-clock"></i> Coverage pending</span>';
    }
    return actions.join('');
}

function renderGameCard(game) {
    const competitors = game.competitors || [];
    const showScore = game.status?.state === 'live' || game.status?.state === 'final';
    const networks = game.viewing?.networks || game.broadcasts || [];
    const visibleNetworks = networks.slice(0, 3);
    const extraNetworkCount = Math.max(0, networks.length - visibleNetworks.length);
    const venue = [game.venue?.name, game.venue?.location].filter(Boolean).join(' / ');
    const stateLabel = game.status?.state === 'live' ? 'Live' : game.status?.state === 'final' ? 'Final' : 'Upcoming';

    return `
        <article class="sports-game-card" data-state="${escapeHtml(game.status?.state || 'scheduled')}" data-league-group="${escapeHtml(game.league?.group || 'sports')}">
            <div class="sports-game-card-head">
                <span class="sports-game-league">${escapeHtml(game.league?.label || 'Sports')}</span>
                <span class="sports-game-state"><i></i>${escapeHtml(stateLabel)}</span>
            </div>
            <div class="sports-game-matchup" aria-label="${escapeHtml(game.fullTitle || game.title)}">
                ${competitors.length >= 2
                    ? competitors.slice(0, 2).map(competitor => renderGameTeam(competitor, showScore)).join('')
                    : `<h3>${escapeHtml(game.title)}</h3>`}
            </div>
            <div class="sports-game-when">
                <strong>${escapeHtml(getGameStatusLabel(game))}</strong>
                ${venue ? `<span><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escapeHtml(venue)}</span>` : ''}
            </div>
            <div class="sports-game-networks">
                ${visibleNetworks.length
                    ? visibleNetworks.map(network => `<span>${escapeHtml(network)}</span>`).join('')
                    : '<span class="pending">Broadcaster pending</span>'}
                ${extraNetworkCount ? `<span>+${extraNetworkCount}</span>` : ''}
            </div>
            <div class="sports-game-card-actions">${renderGameActions(game)}</div>
        </article>
    `;
}

function normalizeGameNetwork(value = '') {
    return String(value)
        .toLowerCase()
        .replaceAll('&', ' and ')
        .replaceAll('+', ' plus ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function getBrowserGameProvider(network = '') {
    const value = normalizeGameNetwork(network);
    const original = String(network).trim();
    if (!value) return null;
    if (/\.tv$/i.test(original) && !/^(?:apple|nba|f1)\s/i.test(original)) {
        return { name: 'MLB.TV', url: 'https://www.mlb.com/live-stream-games/' };
    }
    if (value.startsWith('espn')) return { name: 'ESPN', url: 'https://www.espn.com/watch/' };
    if (value === 'abc') return { name: 'ABC', url: 'https://abc.com/watch-live' };
    if (value === 'cbs') return { name: 'CBS', url: 'https://www.cbs.com/live-tv/' };
    if (/^(?:cbssn|cbs sports network|paramount plus)$/.test(value)) return { name: 'Paramount+', url: 'https://www.paramountplus.com/sports/' };
    if (/^(?:fox|fs1|fs2|fox deportes|btn)$/.test(value)) return { name: 'FOX Sports', url: 'https://www.foxsports.com/live' };
    if (/^(?:nbc|nbcsn|usa net|usa network|peacock|golf chnl|golf channel)/.test(value)) return { name: 'Peacock', url: 'https://www.peacocktv.com/sports' };
    if (value === 'prime video') return { name: 'Prime Video', url: 'https://www.amazon.com/gp/video/sports' };
    if (value === 'apple tv') return { name: 'Apple TV', url: 'https://tv.apple.com/us/channel/mls-season-pass/tvs.sbd.7000' };
    if (/^(?:tnt|tbs|trutv|tru tv|max)$/.test(value)) return { name: 'Max Sports', url: 'https://play.max.com/sports' };
    if (/^(?:nba tv|nba league pass)$/.test(value)) return { name: 'NBA League Pass', url: 'https://www.nba.com/watch/league-pass-stream' };
    if (value === 'wnba league pass') return { name: 'WNBA League Pass', url: 'https://www.wnba.com/leaguepass' };
    if (value === 'nhl network') return { name: 'NHL', url: 'https://www.nhl.com/where-to-stream' };
    if (value === 'tennis channel') return { name: 'Tennis Channel', url: 'https://www.tennischannel.com/watch' };
    if (value.startsWith('bein sports')) return { name: 'beIN Sports', url: 'https://www.beinsports.com/en-us' };
    if (value.startsWith('fifa plus')) return { name: 'FIFA+', url: 'https://www.plus.fifa.com/' };
    return null;
}

function buildBrowserViewing(game, broadcasts) {
    const channels = [];
    const providers = [];
    broadcasts.forEach(network => {
        const channelId = GAME_CHANNEL_IDS_BY_NETWORK.get(normalizeGameNetwork(network));
        const channel = state.channels.find(candidate => candidate.id === channelId);
        if (channel && !channels.some(candidate => candidate.id === channel.id)) {
            channels.push({
                id: channel.id,
                name: channel.name,
                logo: channel.logo || '',
                quality: channel.streams?.[0]?.quality || 'Auto'
            });
        }
        const provider = getBrowserGameProvider(network);
        if (provider && !providers.some(candidate => candidate.url === provider.url)) {
            providers.push({ ...provider, network });
        }
    });

    return {
        channels,
        providers: providers.length ? providers : [...(game.viewing?.providers || [])],
        networks: [...broadcasts]
    };
}

function scheduleEnrichmentRender() {
    if (state.gameEnrichmentRenderTimer) globalThis.clearTimeout(state.gameEnrichmentRenderTimer);
    state.gameEnrichmentRenderTimer = globalThis.setTimeout(() => {
        state.gameEnrichmentRenderTimer = null;
        renderGames();
    }, 120);
}

async function enrichGameBroadcasts(game) {
    const league = game.league;
    if (!game.sourceId || !league?.sport || !league.slug) {
        state.enrichingGames.delete(game.id);
        state.failedGames.add(game.id);
        return;
    }

    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), 15_000);
    const sport = encodeURIComponent(league.sport);
    const slug = encodeURIComponent(league.slug);
    const eventId = encodeURIComponent(game.sourceId);
    const url = `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${slug}/events/${eventId}/competitions/${eventId}/broadcasts?lang=en&region=us`;

    try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`Broadcast guide returned ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload.items)) throw new Error('Broadcast guide returned invalid data');
        const broadcasts = [...new Set(payload.items
            .map(item => item.station || item.media?.shortName || item.media?.name || '')
            .map(value => String(value).trim())
            .filter(Boolean))];

        state.games = state.games.map(candidate => candidate.id === game.id ? {
            ...candidate,
            broadcasts: broadcasts.length ? broadcasts : candidate.broadcasts,
            viewing: broadcasts.length ? buildBrowserViewing(candidate, broadcasts) : candidate.viewing,
            broadcastsEnriched: true
        } : candidate);
        state.enrichedGames.add(game.id);
        scheduleEnrichmentRender();
    } catch (error) {
        state.failedGames.add(game.id);
    } finally {
        globalThis.clearTimeout(timeoutId);
        state.enrichingGames.delete(game.id);
    }
}

function enrichVisibleCompactGames() {
    const games = getVisibleGames().slice(0, 96).filter(game => (
        game.compact
        && game.sourceId
        && game.league?.sport
        && game.league?.slug
        && !game.broadcastsEnriched
        && !state.enrichingGames.has(game.id)
        && !state.enrichedGames.has(game.id)
        && !state.failedGames.has(game.id)
    ));

    games.forEach((game, index) => {
        state.enrichingGames.add(game.id);
        const delay = Math.floor(index / 5) * 1_000;
        globalThis.setTimeout(() => {
            void enrichGameBroadcasts(game);
        }, delay);
    });
}

function renderGames() {
    if (!dom.gameGrid) return;
    const games = getVisibleGames();
    const displayedGames = games.slice(0, 96);
    if (dom.gameCount) {
        const suffix = games.length > displayedGames.length ? ` / showing ${displayedGames.length}` : '';
        dom.gameCount.textContent = `${games.length} game${games.length === 1 ? '' : 's'}${suffix}`;
    }

    if (!displayedGames.length) {
        dom.gameGrid.innerHTML = `
            <div class="sports-game-empty">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <strong>No matching games</strong>
                <span>Try another team, league, or date range.</span>
            </div>
        `;
        return;
    }

    dom.gameGrid.innerHTML = displayedGames.map(renderGameCard).join('');
    dom.gameGrid.querySelectorAll('[data-channel-id]').forEach(button => {
        button.addEventListener('click', () => {
            const channel = state.channels.find(candidate => candidate.id === button.dataset.channelId);
            if (!channel) {
                setGameStatus('The channel guide is still loading. Try again in a moment.', 'loading');
                loadCatalog();
                return;
            }
            tuneChannel(channel);
            dom.playerShell?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    });
    dom.gameGrid.querySelectorAll('.sports-game-team-logo img').forEach(image => {
        image.addEventListener('error', event => {
            event.currentTarget.style.display = 'none';
        }, { once: true });
    });
    Promise.resolve().then(enrichVisibleCompactGames);
}

function renderGameLoadingState() {
    if (!dom.gameGrid) return;
    dom.gameGrid.innerHTML = Array.from({ length: 6 }, () => `
        <div class="sports-game-card sports-game-skeleton" aria-hidden="true">
            <span></span><span></span><span></span>
        </div>
    `).join('');
    if (dom.gameCount) dom.gameCount.textContent = 'Loading games';
}

async function loadGameGuide({ force = false } = {}) {
    if (state.gamesLoading || (state.gamesLoaded && !force)) {
        renderGameWindowFilters();
        renderGameLeagueFilters();
        renderGames();
        return;
    }

    state.gamesLoading = true;
    if (force) {
        state.enrichingGames.clear();
        state.enrichedGames.clear();
        state.failedGames.clear();
        if (state.gameEnrichmentRenderTimer) {
            globalThis.clearTimeout(state.gameEnrichmentRenderTimer);
            state.gameEnrichmentRenderTimer = null;
        }
    }
    renderGameLoadingState();
    setGameStatus('Loading schedules across every league...', 'loading');

    try {
        const response = await fetch('/api/live-tv/games', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Sports guide returned ${response.status}`);
        const data = await response.json();
        if (!data.success || !Array.isArray(data.events)) throw new Error(data.error || 'Invalid sports guide');

        state.games = data.events;
        state.gameLeagues = Array.isArray(data.leagues) ? data.leagues : [];
        state.gameDateWindow = data.window || null;
        state.gamesLoaded = true;
        if (state.activeGameLeague !== 'all' && !state.gameLeagues.some(league => league.id === state.activeGameLeague)) {
            state.activeGameLeague = 'all';
        }
        if (data.window && dom.gameWindowLabel) {
            dom.gameWindowLabel.textContent = `${data.window.from} through ${data.window.to}`;
        }
        if (state.gameWindow === 'today' && !getVisibleGames().length && state.games.length) state.gameWindow = 'week';

        renderGameWindowFilters();
        renderGameLeagueFilters();
        renderGames();
        const liveCount = state.games.filter(game => game.status?.state === 'live').length;
        const warning = data.warning ? ` ${data.warning}` : '';
        setGameStatus(`${liveCount} live / ${state.games.length} indexed.${warning}`, data.stale || data.partial ? 'warning' : 'ready');
    } catch (error) {
        console.error('[LiveTV] Unable to load sports guide:', error);
        setGameStatus('Game schedules are unavailable. Try again shortly.', 'error');
        dom.gameGrid.innerHTML = `
            <button id="sports-game-retry" class="sports-game-empty sports-game-retry" type="button">
                <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
                <strong>Schedule unavailable</strong>
                <span>Choose this card to retry.</span>
            </button>
        `;
        document.getElementById('sports-game-retry')?.addEventListener('click', () => loadGameGuide({ force: true }));
    } finally {
        state.gamesLoading = false;
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
    dom.gameSearch = document.getElementById('sports-game-search');
    dom.gameWindows = document.getElementById('sports-game-windows');
    dom.gameLeagueFilters = document.getElementById('sports-league-filters');
    dom.gameGrid = document.getElementById('sports-game-grid');
    dom.gameCount = document.getElementById('sports-game-count');
    dom.gameStatus = document.getElementById('sports-game-status');
    dom.gameWindowLabel = document.getElementById('sports-game-window');
    dom.liveGameCount = document.getElementById('sports-live-count');

    dom.search?.addEventListener('input', event => {
        state.query = event.target.value.trim();
        renderChannels();
    });
    dom.gameSearch?.addEventListener('input', event => {
        const previousQuery = state.gameQuery;
        state.gameQuery = event.target.value.trim();
        if (state.gameQuery && !previousQuery) state.gameWindow = 'all';
        renderGameWindowFilters();
        renderGames();
    });
    dom.gameWindows?.querySelectorAll('button[data-window]').forEach(button => {
        button.addEventListener('click', () => {
            state.gameWindow = button.dataset.window || 'today';
            renderGameWindowFilters();
            renderGames();
        });
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
        loadGameGuide();
    });
    globalThis.addEventListener('hashchange', () => {
        if (!globalThis.location.hash.startsWith('#live-tv')) stopPlayback();
    });

    updateClock();
    globalThis.setInterval(updateClock, 30_000);
    globalThis.addEventListener('keydown', event => {
        if (event.key !== '/' || !globalThis.location.hash.startsWith('#live-tv')) return;
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        event.preventDefault();
        dom.gameSearch?.focus();
    });
}
