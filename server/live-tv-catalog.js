const FEATURED_CHANNEL_IDS = new Set([
    'ABCNewsLive.us',
    'CBSNews24x7.us',
    'NBCNewsNow.us',
    'LiveNOWfromFOX.us',
    'BloombergTV.us',
    'WeatherNation.us',
    'NASAPlus.us',
    'PBSKids.us',
    'PlutoTVSpotlight.us',
    'PlutoTVMovies.us',
    'PlutoTVSports.us'
]);

const CATEGORY_LABELS = {
    animation: 'Animation', auto: 'Auto', business: 'Business', comedy: 'Comedy',
    documentary: 'Documentary', education: 'Education', entertainment: 'Entertainment',
    family: 'Family', general: 'General', kids: 'Kids', lifestyle: 'Lifestyle',
    movies: 'Movies', music: 'Music', news: 'News', outdoor: 'Outdoor',
    science: 'Science', series: 'Series', sports: 'Sports', travel: 'Travel', weather: 'Weather'
};

function qualityScore(value = '') {
    const match = String(value).match(/(\d{3,4})p/i);
    return match ? Number(match[1]) : 0;
}

export function isDirectWebStream(stream) {
    const url = String(stream?.url || '').trim();
    const labels = Array.isArray(stream?.labels) ? stream.labels : [];
    return !!stream?.channel
        && /^https:\/\//i.test(url)
        && /\.m3u8(?:[?#]|$)/i.test(url)
        && !stream?.referrer
        && !stream?.user_agent
        && labels.length === 0;
}

function pickLogo(logos = []) {
    return logos
        .filter(logo => logo?.in_use !== false && /^https:\/\//i.test(String(logo?.url || '')))
        .sort((a, b) => {
            const aHorizontal = Array.isArray(a.tags) && a.tags.includes('horizontal') ? 1 : 0;
            const bHorizontal = Array.isArray(b.tags) && b.tags.includes('horizontal') ? 1 : 0;
            return bHorizontal - aHorizontal || Number(b.width || 0) - Number(a.width || 0);
        })[0]?.url || '';
}

function primaryCategory(channel) {
    const categories = Array.isArray(channel?.categories) ? channel.categories : [];
    return categories.find(category => CATEGORY_LABELS[category]) || 'general';
}

export function buildLiveChannelCatalog({ channels = [], streams = [], logos = [] }, options = {}) {
    const country = String(options.country || 'US').toUpperCase();
    const limit = Math.min(200, Math.max(1, Number(options.limit) || 120));
    const channelById = new Map(channels
        .filter(channel => channel?.id && channel.country === country && !channel.is_nsfw && !channel.closed && !channel.replaced_by)
        .map(channel => [channel.id, channel]));
    const streamsByChannel = new Map();
    const logosByChannel = new Map();

    streams.filter(isDirectWebStream).forEach(stream => {
        if (!channelById.has(stream.channel)) return;
        if (!streamsByChannel.has(stream.channel)) streamsByChannel.set(stream.channel, []);
        streamsByChannel.get(stream.channel).push(stream);
    });
    logos.forEach(logo => {
        if (!channelById.has(logo?.channel)) return;
        if (!logosByChannel.has(logo.channel)) logosByChannel.set(logo.channel, []);
        logosByChannel.get(logo.channel).push(logo);
    });

    const catalog = [...streamsByChannel.entries()]
        .map(([channelId, candidates]) => {
            const channel = channelById.get(channelId);
            const category = primaryCategory(channel);
            const seen = new Set();
            const directStreams = candidates
                .sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality))
                .filter(stream => {
                    if (seen.has(stream.url)) return false;
                    seen.add(stream.url);
                    return true;
                })
                .slice(0, 4)
                .map(stream => ({ url: stream.url, type: 'hls', quality: stream.quality || 'Auto' }));
            return {
                id: channel.id,
                name: channel.name,
                network: channel.network || '',
                website: /^https?:\/\//i.test(String(channel.website || '')) ? channel.website : '',
                logo: pickLogo(logosByChannel.get(channelId) || []),
                category,
                categoryLabel: CATEGORY_LABELS[category] || 'General',
                categories: (channel.categories || []).filter(value => CATEGORY_LABELS[value]),
                featured: FEATURED_CHANNEL_IDS.has(channel.id),
                streams: directStreams
            };
        })
        .filter(channel => channel.streams.length);

    const featured = catalog.filter(channel => channel.featured).sort((a, b) => a.name.localeCompare(b.name));
    const categoryOrder = ['news', 'movies', 'sports', 'kids', 'entertainment', 'general', 'documentary', 'music', 'weather', 'science', 'family', 'comedy', 'lifestyle', 'travel', 'education', 'animation', 'outdoor', 'business', 'auto', 'series'];
    const buckets = new Map(categoryOrder.map(category => [category, []]));
    catalog.filter(channel => !channel.featured).sort((a, b) => a.name.localeCompare(b.name)).forEach(channel => {
        if (!buckets.has(channel.category)) buckets.set(channel.category, []);
        buckets.get(channel.category).push(channel);
    });
    const balanced = [];
    let hasMore = true;
    while (hasMore) {
        hasMore = false;
        buckets.forEach(bucket => {
            const channel = bucket.shift();
            if (channel) {
                balanced.push(channel);
                hasMore = true;
            }
        });
    }
    return [...featured, ...balanced].slice(0, limit);
}
