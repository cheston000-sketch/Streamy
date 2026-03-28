import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
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

app.get('/api/stream', async (req, res) => {
    const { tmdb, type, title, year, season, episode } = req.query;

    if (!tmdb || !title || !year) {
        return res.status(400).json({ error: "Missing parameters" });
    }

    try {
        console.log(`[Extractor] Hunting raw streams for: ${title} (${year})`);
        
        const media = (type === 'tv' || type === 'show') 
            ? { type: 'show', title, releaseYear: Number(year), tmdbId: tmdb, season: { number: Number(season) }, episode: { number: Number(episode) } }
            : { type: 'movie', title, releaseYear: Number(year), tmdbId: tmdb };

        // To simulate BeeTV, we will run all providers and accumulate all streams
        const output = await Promise.race([
            providers.runAll({ media }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Headless Scraper Timeout Hit')), 12000))
        ]);
        console.log("[Extractor] runAll RAW OUTPUT:", JSON.stringify(output, null, 2));

        let finalLinks = [];
        
        if (output && output.stream) {
            // Handle if stream is an array
            const streamArray = Array.isArray(output.stream) ? output.stream : [output.stream];
            
            streamArray.forEach(streamObj => {
                if (!streamObj) return;

                // Single URL formats
                if (streamObj.url) {
                    finalLinks.push({ server: `${output.sourceId}`, url: streamObj.url, type: 'mp4' });
                }
                if (streamObj.playlistUrl) {
                    finalLinks.push({ server: `${output.sourceId} (Auto)`, url: streamObj.playlistUrl, type: 'hls' });
                }
                if (streamObj.playlist) {
                    finalLinks.push({ server: `${output.sourceId} (Auto)`, url: streamObj.playlist, type: 'hls' });
                }
                
                // Multiple qualities inside a single stream object
                if (streamObj.qualities) {
                    for (let q in streamObj.qualities) {
                        if (streamObj.qualities[q] && streamObj.qualities[q].url) {
                            finalLinks.push({ server: `${output.sourceId} - ${q}`, url: streamObj.qualities[q].url, type: 'mp4' });
                        }
                    }
                }
            });
        }

        // Deduplicate
        finalLinks = finalLinks.filter((value, index, self) =>
            index === self.findIndex((t) => (t.url === value.url))
        );

        // If native extraction fails, inject robust fallback iframe embeds
        if (finalLinks.length === 0) {
            console.log(`[Extractor] Primary providers failed. Injecting fallback iframe embeds.`);
            const vidsrcUrl = (type === 'tv' || type === 'show')
                ? `https://vidsrc.me/embed/tv?tmdb=${tmdb}&season=${season}&episode=${episode}`
                : `https://vidsrc.me/embed/movie?tmdb=${tmdb}`;
            finalLinks.push({ server: 'Vidsrc.me', url: vidsrcUrl, type: 'iframe' });

            const vidsrcNetUrl = (type === 'tv' || type === 'show')
                ? `https://vidsrc.net/embed/tv?tmdb=${tmdb}&season=${season}&episode=${episode}`
                : `https://vidsrc.net/embed/movie?tmdb=${tmdb}`;
            finalLinks.push({ server: 'Vidsrc.net', url: vidsrcNetUrl, type: 'iframe' });

            const multiEmbedUrl = (type === 'tv' || type === 'show')
                ? `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1&s=${season}&e=${episode}`
                : `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1`;
            finalLinks.push({ server: 'MultiEmbed', url: multiEmbedUrl, type: 'iframe' });
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
        if (contentType && contentType.indexOf("application/json") !== -1) {
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
// OTA UPDATE SERVER (For Firestick App)
// ==========================================
const LOCAL_APK = path.join(__dirname, '..', '..', 'BeeTV', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const CLOUD_APK = path.join(__dirname, '..', 'StreamOS.apk');

app.get(['/api/ota', '/api/ota/check'], (req, res) => {
    // Read the current build.gradle version dynamically!
    // (In a true production app, this would query a database, but on Render we rely on hardcoded version for non-repo files!)
    try {
        const targetGradle = path.join(__dirname, '..', '..', 'BeeTV', 'app', 'build.gradle');
        if (fs.existsSync(targetGradle)) {
            const gradleContent = fs.readFileSync(targetGradle, 'utf8');
            const vCodeMatch = gradleContent.match(/versionCode\s+(\d+)/);
            if (vCodeMatch) {
                return res.json({ available: true, version: parseInt(vCodeMatch[1]), download: '/api/ota/download' });
            }
        }
    } catch(e) {}
    
    // Fallback for Render deployment where BeeTV folder is missing
    res.json({ available: true, version: 61, download: '/api/ota/download' });
});

app.get('/api/ota/download', (req, res) => {
    if (fs.existsSync(CLOUD_APK)) {
        res.download(CLOUD_APK, 'StreamOS.apk');
    } else if (fs.existsSync(LOCAL_APK)) {
        res.download(LOCAL_APK, 'StreamOS.apk');
    } else {
        res.status(404).send("APK sequence entirely absent from Cloud Node.");
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 StreamOS Full-Stack Server Running!`);
    console.log(`📂 App URI: http://localhost:${PORT}`);
    console.log(`📡 API URI: http://localhost:${PORT}/api/stream\n`);
});
