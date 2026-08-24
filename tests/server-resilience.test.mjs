import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function getAvailablePort() {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address();
    server.close();
    await once(server, 'close');
    return port;
}

async function waitForHealth(baseUrl, serverOutput) {
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) return response.json();
        } catch (error) {
            // The server may still be starting.
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Server did not become healthy.\n${serverOutput()}`);
}

const port = await getAvailablePort();
const baseUrl = `http://127.0.0.1:${port}`;
let output = '';
const serverProcess = spawn(process.execPath, ['www/server/index.js'], {
    cwd: rootDir,
    env: {
        ...process.env,
        PORT: String(port),
        ENABLE_BEE_COMPAT_SOURCES: 'false',
        ENABLE_BUILT_IN_PROVIDERS: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
});

serverProcess.stdout.on('data', chunk => { output += chunk.toString(); });
serverProcess.stderr.on('data', chunk => { output += chunk.toString(); });

try {
    const health = await waitForHealth(baseUrl, () => output);
    assert.equal(health.status, 'ok');
    assert.equal(health.build, 112);
    assert.equal(health.providerApi, true);

    const providersResponse = await fetch(`${baseUrl}/api/providers`);
    assert.equal(providersResponse.status, 200);
    const providerInfo = await providersResponse.json();
    assert.equal(providerInfo.backendBuild, 112);
    assert.equal(providerInfo.builtInProvidersEnabled, false);

    const streamResponse = await fetch(`${baseUrl}/api/stream?tmdb=550&type=movie&title=Fight%20Club&year=1999`);
    assert.equal(streamResponse.status, 200);
    const streamData = await streamResponse.json();
    assert.equal(streamData.success, true);
    assert.equal(streamData.providerStatus.fallbackOnly, true);
    assert.equal(streamData.providerStatus.degraded, true);
    assert.ok(streamData.links.some(link => link.server === 'Vidlink' && link.type === 'iframe'));

    assert.equal((await fetch(`${baseUrl}/server/index.js`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/package.json`)).status, 404);
    console.log('Server resilience tests passed.');
} finally {
    serverProcess.kill();
    if (serverProcess.exitCode === null) {
        await Promise.race([
            once(serverProcess, 'exit'),
            new Promise(resolve => setTimeout(resolve, 3000))
        ]);
    }
}
