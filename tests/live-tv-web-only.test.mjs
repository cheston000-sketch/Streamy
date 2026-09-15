import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => readFile(path.join(rootDir, relativePath), 'utf8');

const [websiteIndex, websiteRouter, packagedIndex, androidIndex, androidRouter] = await Promise.all([
    read('index.html'),
    read('js/router.js'),
    read('www/index.html'),
    read('android/app/src/main/assets/public/index.html'),
    read('android/app/src/main/assets/public/js/router.js')
]);

assert.match(websiteIndex, /data-view="live-tv"/);
assert.match(websiteIndex, /id="view-live-tv"/);
assert.match(websiteRouter, /'#live-tv'/);
assert.doesNotMatch(packagedIndex, /data-view="live-tv"|id="view-live-tv"/);
assert.doesNotMatch(androidIndex, /data-view="live-tv"|id="view-live-tv"/);
assert.doesNotMatch(androidRouter, /'#live-tv'/);

console.log('Live TV website-only boundary tests passed.');
