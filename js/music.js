import { fetchMusicManifest, searchMusic, searchMusicSaavn } from './api.js?v=44';

export const MusicState = {
    playlists: {},
    recent: [],
    categories: [
        {id: '0', title: 'Trending Music', type: 'chart'},
        {id: '152', title: 'Alternative Rock', type: 'chart'},
        {id: '132', title: 'Hip Hop', type: 'chart'},
        {id: '116', title: 'Rap', type: 'chart'}
    ],
    currentTrack: null,
    queue: [],
    currentIndex: -1,
    isPlaying: false
};

const STORAGE_KEY = 'streamos_music_state';

export function initMusic() {
    loadMusicState();
    setupPlayerEventListeners();
}

export function saveMusicState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        playlists: MusicState.playlists,
        recent: MusicState.recent,
        categories: MusicState.categories
    }));
}

function loadMusicState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        MusicState.playlists = parsed.playlists || {};
        MusicState.recent = parsed.recent || [];
        if (parsed.categories && parsed.categories.length > 0) {
            MusicState.categories = parsed.categories;
        }
    }
}

function setupPlayerEventListeners() {
    const audio = document.getElementById('native-audio-player');
    const toggleBtn = document.getElementById('player-toggle-btn');
    const prevBtn = document.getElementById('player-prev-btn');
    const nextBtn = document.getElementById('player-next-btn');
    const closeBtn = document.getElementById('player-close-btn');
    const progressBg = document.getElementById('player-progress-bg');
    const progressFill = document.getElementById('player-progress-fill');
    const currentTimeEl = document.getElementById('player-current-time');
    const durationEl = document.getElementById('player-duration');

    if (!audio) return;

    audio.ontimeupdate = () => {
        const percent = (audio.currentTime / audio.duration) * 100;
        if (progressFill) progressFill.style.width = `${percent}%`;
        if (currentTimeEl) currentTimeEl.textContent = formatTime(audio.currentTime);
        if (durationEl && !Number.isNaN(audio.duration)) durationEl.textContent = formatTime(audio.duration);
    };

    audio.onplay = () => {
        MusicState.isPlaying = true;
        updatePlayerUI();
    };

    audio.onpause = () => {
        MusicState.isPlaying = false;
        updatePlayerUI();
    };

    audio.onended = () => {
        playNext();
    };

    toggleBtn?.addEventListener('click', () => {
        if (audio.paused) audio.play();
        else audio.pause();
    });

    prevBtn?.addEventListener('click', () => playPrev());
    nextBtn?.addEventListener('click', () => playNext());
    closeBtn?.addEventListener('click', () => {
        audio.pause();
        document.getElementById('music-player-bar').classList.add('hidden');
    });

    progressBg?.addEventListener('click', (e) => {
        const rect = progressBg.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pos * audio.duration;
    });

    // D-pad support for progress bar
    progressBg?.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') audio.currentTime += 5;
        if (e.key === 'ArrowLeft') audio.currentTime -= 5;
    });
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

export async function playTrack(track, queue = []) {
    const audio = document.getElementById('native-audio-player');
    const source = document.getElementById('native-audio-source');
    const playerBar = document.getElementById('music-player-bar');

    if (!audio || !source || !playerBar) return;

    MusicState.currentTrack = track;
    if (queue.length > 0) {
        MusicState.queue = queue;
        MusicState.currentIndex = queue.findIndex(t => t.id === track.id);
    }

    // Update UI immediately
    document.getElementById('player-bar-title').textContent = track.title;
    document.getElementById('player-bar-artist').textContent = track.artist;
    document.getElementById('player-bar-cover').src = track.poster || track.cover || 'https://via.placeholder.com/150';
    playerBar.classList.remove('hidden');

    const heroBanner = document.getElementById('music-hero-banner');
    if (heroBanner && track.poster) heroBanner.style.backgroundImage = `url('${track.poster}')`;

    document.dispatchEvent(new CustomEvent('streamos:track_changed', { detail: track }));

    try {
        let res = null;
        try {
            res = await fetchMusicManifest(track.id);
        } catch (e) {
            console.error("Primary manifest fetch threw error:", e);
        }
        
        // Fallback 1: Metadata Search via Streamex (Secondary ID)
        if (!res?.data?.manifest) {
            console.warn("Primary ID manifest failed, attempting Streamex search fallback...");
            const searchRes = await searchMusic(`${track.title} ${track.artist}`);
            const searchItems = searchRes.data?.items || searchRes.data || [];
            const firstMatch = searchItems.find?.(item => item.type === 'track' || item.type === 'music');
            if (firstMatch && String(firstMatch.id) !== String(track.id)) {
                try {
                    res = await fetchMusicManifest(firstMatch.id);
                } catch(e) {}
            }
        }

        // Fallback 2: Universal Search via Saavn (Direct Stream Fallback)
        let directUrl = null;
        if (!res?.data?.manifest) {
            console.warn("Streamex pipeline failed, attempting Universal Saavn fallback...");
            try {
                const saavnRes = await searchMusicSaavn(`${track.title} ${track.artist}`);
                const saavnItems = saavnRes?.data?.results || [];
                if (saavnItems.length > 0) {
                    const topMatch = saavnItems[0];
                    // Pick the highest quality (320kbps is usually index 4)
                    const urls = topMatch.downloadUrl || [];
                    directUrl = (urls[urls.length - 1] || urls[0])?.url;
                    console.log("Found Universal Saavn stream:", directUrl);
                }
            } catch (e) {
                console.error("Universal fallback failed:", e);
            }
        }

        if (res?.data?.manifest || directUrl) {
            if (directUrl) {
                source.src = directUrl;
            } else {
                const decoded = atob(res.data.manifest);
                const manifest = JSON.parse(decoded);
                source.src = manifest.urls[0];
            }
            audio.load();
            audio.play().catch(e => console.warn("Autoplay blocked", e));
            
            // Record history
            MusicState.recent = MusicState.recent.filter(t => t.id !== track.id);
            MusicState.recent.unshift({ ...track, playedAt: Date.now() });
            if (MusicState.recent.length > 20) MusicState.recent.pop();
            localStorage.setItem('streamos_recent_music', JSON.stringify(MusicState.recent));
        } else {
            throw new Error("Unable to fetch audio stream after all fallbacks.");
        }
    } catch (e) {
        console.error("Play error:", e);
    }
}

function addToHistory(track) {
    MusicState.recent = MusicState.recent.filter(t => t.id !== track.id);
    MusicState.recent.unshift(track);
    if (MusicState.recent.length > 50) MusicState.recent.pop();
    saveMusicState();
}

export function playNext() {
    if (MusicState.currentIndex < MusicState.queue.length - 1) {
        MusicState.currentIndex++;
        playTrack(MusicState.queue[MusicState.currentIndex]);
    }
}

export function playPrev() {
    if (MusicState.currentIndex > 0) {
        MusicState.currentIndex--;
        playTrack(MusicState.queue[MusicState.currentIndex]);
    }
}

function updatePlayerUI() {
    const toggleBtn = document.getElementById('player-toggle-btn');
    if (toggleBtn) {
        toggleBtn.innerHTML = MusicState.isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    }
}

export function getMusicPosterPath(item) {
    const coverUuid = item.album?.cover || item.cover || item.thumbnail;
    if (coverUuid && typeof coverUuid === 'string' && coverUuid.includes('-')) {
        return `https://resources.tidal.com/images/${coverUuid.replaceAll('-', '/')}/640x640.jpg`;
    }
    return coverUuid && typeof coverUuid === 'string' ? coverUuid : `https://via.placeholder.com/600x600?text=${encodeURIComponent(item.title || 'Music')}`;
}
