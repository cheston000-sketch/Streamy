import { makeProviders, makeStandardFetcher, targets } from '@movie-web/providers';

const providers = makeProviders({
    fetcher: makeStandardFetcher(fetch),
    target: targets.ANY
});

async function run() {
    try {
        const media = { type: 'movie', title: 'Venom', releaseYear: 2024, tmdbId: '912649' };
        const output = await providers.runAll({ media });
        console.log("OUTPUT:", JSON.stringify(output, null, 2));
    } catch(e) {
        console.error("ERROR:", e);
    }
}
run();
