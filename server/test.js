import { MOVIES } from '@consumet/extensions';

async function test() {
    const flixhq = new MOVIES.FlixHQ();
    console.log("Searching FlixHQ...");
    try {
        const searchRes = await flixhq.search("Hamilton");
        console.log("Search result:", searchRes.results[0]?.title);
        
        if(searchRes.results.length > 0) {
            const info = await flixhq.fetchMediaInfo(searchRes.results[0].id);
            console.log("Media info fetched.");
            
            const sources = await flixhq.fetchEpisodeSources(info.episodes[0].id, info.id);
            console.log("Raw Stream Found:", sources.sources[0]?.url);
        }
    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();
