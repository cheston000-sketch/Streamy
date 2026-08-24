import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const sourceDir = path.join(rootDir, 'www');
const targetDir = path.join(rootDir, 'app-dist');
const runtimeFiles = ['index.html', 'styles.css', 'manifest.json', 'icon.svg', 'tunnel_url.txt'];
const runtimeDirectories = ['js', 'vendor'];
const maxBundleBytes = 20 * 1024 * 1024;

if (path.dirname(targetDir) !== rootDir || path.basename(targetDir) !== 'app-dist') {
    throw new Error(`Refusing to prepare unexpected output path: ${targetDir}`);
}

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });

for (const fileName of runtimeFiles) {
    await cp(path.join(sourceDir, fileName), path.join(targetDir, fileName));
}

for (const directoryName of runtimeDirectories) {
    await cp(path.join(sourceDir, directoryName), path.join(targetDir, directoryName), { recursive: true });
}

async function getDirectorySize(directory) {
    let totalBytes = 0;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        totalBytes += entry.isDirectory() ? await getDirectorySize(entryPath) : (await stat(entryPath)).size;
    }
    return totalBytes;
}

const bundleBytes = await getDirectorySize(targetDir);
if (bundleBytes > maxBundleBytes) {
    throw new Error(`Android web bundle is unexpectedly large: ${(bundleBytes / 1024 / 1024).toFixed(1)} MB`);
}

console.log(`Prepared Android web bundle: ${(bundleBytes / 1024 / 1024).toFixed(1)} MB`);
