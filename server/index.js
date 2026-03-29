import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeProviders, makeStandardFetcher, targets } from '@movie-web/providers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Ghost Thread] Blocked rogue unhandled rejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Ghost Thread] Blocked fatal crash:', err.message);
});

app.use(cors());
app.use(express.static(path.join(__dirname, '../')));

const providers = makeProviders({
    fetcher: makeStandardFetcher(fetch),
    target: targets.ANY
});

function extractLinksFromOutput(output) {
    if (!output?.stream) return [];
    const finalLinks = [];
    const streamArray = Array.isArray(output.stream) ? output.stream : [output.stream];
    
    streamArray.forEach(streamObj => {
        if (!streamObj) return;

        const sourceName = output?.sourceId || "Primary";
        if (streamObj.url) {
            finalLinks.push({ server: sourceName, url: streamObj.url, type: 'mp4' });
        }
        if (streamObj.playlistUrl) {
            finalLinks.push({ server: `${sourceName} (Auto)`, url: streamObj.playlistUrl, type: 'hls' });
        }
        if (streamObj.playlist) {
            finalLinks.push({ server: `${sourceName} (Auto)`, url: streamObj.playlist, type: 'hls' });
        }
        
        if (streamObj.qualities) {
            for (const q in streamObj.qualities) {
                const qUrl = streamObj.qualities[q]?.url;
                if (qUrl) {
                    finalLinks.push({ server: `${sourceName} - ${q}`, url: qUrl, type: 'mp4' });
                }
            }
        }
    });
    return finalLinks;
}

function injectFallbackLinks(links, { type, tmdb, season, episode }) {
    console.log(`[Extractor] Primary providers failed. Injecting fallback iframe embeds.`);
    const isTV = type === 'tv' || type === 'show';
    
    // v77-v79: Absolute Primary (User Requested)
    const vidlinkUrl = isTV
        ? `https://vidlink.pro/tv/${tmdb}/${season}/${episode}?primaryColor=6366f1&secondaryColor=a5b4fc&iconColor=ffffff&icons=fontawesome&player=v2&autoplay=true&volume=1.0&muted=0`
        : `https://vidlink.pro/movie/${tmdb}?primaryColor=6366f1&secondaryColor=a5b4fc&iconColor=ffffff&icons=fontawesome&player=v2&autoplay=true&volume=1.0&muted=0`;
    links.push({ server: 'Vidlink (Primary)', url: vidlinkUrl, type: 'iframe' });

    const vidsrcUrl = isTV
        ? `https://vidsrc.me/embed/tv?tmdb=${tmdb}&season=${season}&episode=${episode}`
        : `https://vidsrc.me/embed/movie?tmdb=${tmdb}`;
    links.push({ server: 'Vidsrc.me', url: vidsrcUrl, type: 'iframe' });

    const vidsrcNetUrl = isTV
        ? `https://vidsrc.net/embed/tv?tmdb=${tmdb}&season=${season}&episode=${episode}`
        : `https://vidsrc.net/embed/movie?tmdb=${tmdb}`;
    links.push({ server: 'Vidsrc.net', url: vidsrcNetUrl, type: 'iframe' });

    const multiEmbedUrl = isTV
        ? `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1&s=${season}&e=${episode}`
        : `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1`;
    links.push({ server: 'MultiEmbed', url: multiEmbedUrl, type: 'iframe' });
}

app.get('/api/stream', async (req, res) => {
    const { tmdb, type, title, year, season, episode } = req.query;

    if (!tmdb || !title || !year) {
        return res.status(400).json({ error: "Missing parameters" });
    }

    try {
        console.log(`[Extractor] Hunting raw streams for: ${title} (${year})`);
        
        const isShow = type === 'tv' || type === 'show';
        const media = isShow 
            ? { type: 'show', title, releaseYear: Number(year), tmdbId: tmdb, season: { number: Number(season) }, episode: { number: Number(episode) } }
            : { type: 'movie', title, releaseYear: Number(year), tmdbId: tmdb };

        const output = await Promise.race([
            providers.runAll({ media }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Headless Scraper Timeout Hit')), 12000))
        ]);
        
        let finalLinks = extractLinksFromOutput(output);

        // Deduplicate
        finalLinks = finalLinks.filter((value, index, self) =>
            index === self.findIndex((t) => (t.url === value.url))
        );

        if (finalLinks.length === 0) {
            injectFallbackLinks(finalLinks, { type, tmdb, season, episode });
        }

        if (finalLinks.length > 0) {
            console.log(`[Extractor] SUCCESS: Found ${finalLinks.length} total streams / fallbacks.`);
            return res.json({ success: true, links: finalLinks });
        } else {
            console.log(`[Extractor] ABSOLUTE FAILURE.`);
            return res.json({ success: false, links: [] });
        }
    } catch (error) {
        console.error("[Extractor] Error:", error.message);
        res.status(500).json({ error: "Extractor failed runtime", links: [] });
    }
});

// ==========================================
// MUSIC PROXIES (Streamex & Deezer)
// ==========================================
app.use('/api/streamex', async (req, res) => {
    const streamexPath = req.url.replace(/^\//, '');
    const targetUrl = `https://streamex.sh/api/music/${streamexPath}`;
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://streamex.sh/music',
                'Accept': 'application/json'
            }
        });
        clearTimeout(timeout);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(error.name === 'AbortError' ? 504 : 500).json({ error: error.message });
    }
});

app.use('/api/deezer', async (req, res) => {
    const deezerPath = req.url.replace(/^\//, '');
    const targetUrl = `https://api.deezer.com/${deezerPath}`;
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://www.deezer.com',
                'Referer': 'https://www.deezer.com/'
            }
        });
        clearTimeout(timeout);
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            res.json(data);
        } else {
            const text = await response.text();
            console.error("[Deezer Proxy Error] Expected JSON, got HTML. Render node blocked by Deezer? Snippet:", text.substring(0, 100));
            res.status(502).json({ error: "Upstream Deezer format invalid", raw_snippet: text.substring(0, 100) });
        }
    } catch (error) {
        res.status(error.name === 'AbortError' ? 504 : 500).json({ error: error.message });
    }
});

// Saavn Proxy (Fallback Provider)
app.use('/api/saavn', async (req, res) => {
    const saavnPath = req.url.replace(/^\//, '');
    const targetUrl = `https://saavn.sumit.co/api/${saavnPath}`;
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timeout);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(error.name === 'AbortError' ? 504 : 500).json({ error: error.message });
    }
});

// ==========================================
// OTA UPDATE SERVER (For StreamOS)
// ==========================================
const CLOUD_APK_v78 = path.join(__dirname, '..', 'StreamOS_v78.apk');
const CLOUD_APK_v79 = path.join(__dirname, '..', 'StreamOS_v79.apk');

app.get('/api/ota', (req, res) => {
    // Hardcoded version for v80 update
    res.json({ available: true, version: 84, download: '/api/ota/download' });
});

app.get('/api/ota/download', (req, res) => {
    const CLOUD_APK_v80 = path.join(__dirname, '..', 'StreamOS_v84.apk');
    if (fs.existsSync(CLOUD_APK_v80)) {
        res.download(CLOUD_APK_v80, 'StreamOS_v84.apk');
    } else if (fs.existsSync(CLOUD_APK_v79)) {
        res.download(CLOUD_APK_v79, 'StreamOS_v79.apk');
    } else if (fs.existsSync(CLOUD_APK_v78)) {
        res.download(CLOUD_APK_v78, 'StreamOS_v78.apk');
    } else {
        res.status(404).send("APK sequence entirely absent from Cloud Node.");
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 StreamOS Full-Stack Server Running!`);
    console.log(`📂 App URI: http://localhost:${PORT}`);
    console.log(`📡 API URI: http://localhost:${PORT}/api/stream\n`);
});

