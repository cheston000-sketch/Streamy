import assert from 'node:assert/strict';
import {
    isUpdateRequired,
    normalizeBuildVersion,
    resolveInstalledBuildVersion,
    shouldEnforceUpdate,
    resolveUpdateDownloadUrl
} from '../www/js/update-policy.js';

assert.equal(normalizeBuildVersion('114.0'), 114);
assert.equal(normalizeBuildVersion(null), 0);
assert.equal(isUpdateRequired(113, 114), true);
assert.equal(isUpdateRequired(113, 113), false);
assert.equal(isUpdateRequired(113, 112), false);
assert.equal(resolveInstalledBuildVersion(116, 115), 116);
assert.equal(resolveInstalledBuildVersion(0, 117), 117);
assert.equal(shouldEnforceUpdate(false, 115, 116), false);
assert.equal(shouldEnforceUpdate(true, 115, 116), true);
assert.equal(shouldEnforceUpdate(true, 116, 116), false);
assert.equal(resolveUpdateDownloadUrl('/api/ota/download', 'https://example.com'), 'https://example.com/api/ota/download');
assert.equal(resolveUpdateDownloadUrl('https://cdn.example.com/app.apk', 'https://example.com'), 'https://cdn.example.com/app.apk');
assert.throws(() => resolveUpdateDownloadUrl('/app.apk', ''), /OTA host/);

console.log('Update policy tests passed.');
