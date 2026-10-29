import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
    new URL('../www/js/player.js', import.meta.url),
    new URL('../www/server/index.js', import.meta.url)
];

for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /icons=vid/);
    assert.match(source, /player=default/);
    assert.match(source, /title=false&poster=true&autoplay=true/);
    assert.doesNotMatch(source, /icons=fontawesome/);
    assert.doesNotMatch(source, /player=v2/);
    assert.doesNotMatch(source, /volume=1\.0&muted=0/);
}

const playerSource = await readFile(new URL('../www/js/player.js', import.meta.url), 'utf8');
assert.match(playerSource, /isVidlinkSource\(link\) \? -70/);
assert.doesNotMatch(playerSource, /sorted\.find\(link => link\.type !== 'iframe'\)/);

console.log('VidLink embed configuration tests passed.');
