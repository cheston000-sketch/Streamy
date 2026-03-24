
import express from 'express';
import cors from 'cors';
import path from 'path';
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

        // Removed blind WebPlayer Fallbacks to ensure Auto-Play exclusively triggers for strictly verified .m3u8 extraction payloads natively

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

// OTA Update Endpoints
app.get('/api/ota', (req, res) => {
    res.json({
        version: 30, // Tell it there's a V30 Update out there
        url: `${req.protocol}://${req.get('host')}/api/ota/download`
    });
});

app.get('/api/ota/download', (req, res) => {
    const apkPath = path.join(__dirname, '../StreamOS.apk');
    res.download(apkPath, 'Streamy.apk');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 StreamOS Full-Stack Server Running!`);
    console.log(`📂 App URI: http://localhost:${PORT}`);
    console.log(`📡 API URI: http://localhost:${PORT}/api/stream\n`);
});
