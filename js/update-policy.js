export function normalizeBuildVersion(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function isUpdateRequired(installedVersion, availableVersion) {
    return normalizeBuildVersion(availableVersion) > normalizeBuildVersion(installedVersion);
}

export function resolveUpdateDownloadUrl(downloadUrl, host) {
    const normalizedHost = String(host || '').replace(/\/$/, '');
    if (!normalizedHost) throw new Error('An OTA host is required');
    return new URL(downloadUrl || '/api/ota/download', `${normalizedHost}/`).href;
}
