import assert from 'node:assert/strict';
import {
    isUpdateRequired,
    normalizeBuildVersion,
    resolveUpdateDownloadUrl
} from '../www/js/update-policy.js';

assert.equal(normalizeBuildVersion('114.0'), 114);
assert.equal(normalizeBuildVersion(null), 0);
assert.equal(isUpdateRequired(113, 114), true);
assert.equal(isUpdateRequired(113, 113), false);
assert.equal(isUpdateRequired(113, 112), false);
assert.equal(resolveUpdateDownloadUrl('/api/ota/download', 'https://example.com'), 'https://example.com/api/ota/download');
assert.equal(resolveUpdateDownloadUrl('https://cdn.example.com/app.apk', 'https://example.com'), 'https://cdn.example.com/app.apk');
assert.throws(() => resolveUpdateDownloadUrl('/app.apk', ''), /OTA host/);

console.log('Update policy tests passed.');
