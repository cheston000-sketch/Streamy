import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeProviders, makeStandardFetcher, targets } from '@movie-web/providers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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
        console.log(`[Extractor] Hunting raw stream for: ${title} (${year})`);
        
        const media = (type === 'tv' || type === 'show') 
            ? { type: 'show', title, releaseYear: Number(year), tmdbId: tmdb, season: { number: Number(season) }, episode: { number: Number(episode) } }
            : { type: 'movie', title, releaseYear: Number(year), tmdbId: tmdb };

        const output = await providers.runAll({ media });

        const streamUrl = output?.stream?.playlist || output?.stream?.url || output?.stream?.[0]?.url || output?.stream?.[0]?.playlistUrl;
        
        if (streamUrl) {
            console.log(`[Extractor] SUCCESS: ${streamUrl}`);
            return res.json({ success: true, url: streamUrl });
        } else {
            console.log(`[Extractor] ANTI-BOT BLOCKED: Passing hybrid fallback directive to client.`);
            const fallbackUrl = (type === 'tv' || type === 'show')
                 ? `https://vidsrc.me/embed/tv?tmdb=${tmdb}&season=${season || 1}&episode=${episode || 1}`
                 : `https://vidsrc.me/embed/movie?tmdb=${tmdb}`;
            return res.json({ success: false, fallbackIframe: fallbackUrl });
        }
    } catch (error) {
        console.error("[Extractor] Error:", error.message);
        res.status(500).json({ error: "Extractor failed runtime" });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 StreamOS Full-Stack Server Running!`);
    console.log(`📂 App URI: http://localhost:${PORT}`);
    console.log(`📡 API URI: http://localhost:${PORT}/api/stream\n`);
});
