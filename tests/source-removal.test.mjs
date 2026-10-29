import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const player = await readFile(new URL('../www/js/player.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../www/server/index.js', import.meta.url), 'utf8');

assert.doesNotMatch(player, /player\.videasy\.(?:net|to)/i);
assert.doesNotMatch(server, /VIDEASY_SOURCE_ENDPOINTS|VIDEASY_PROVIDER_ENDPOINTS/);
assert.match(player, /const availableLinks = links\.filter\(link => !isVideasySource\(link\)\)/);
assert.match(server, /function excludeRetiredSources\(links = \[\]\)/);
assert.match(server, /dedupeLinks\(excludeRetiredSources\(\[\.\.\.directLinks, \.\.\.stremioLinks, \.\.\.builtInLinks\]\)\)/);

console.log('Removed provider filtering tests passed.');
