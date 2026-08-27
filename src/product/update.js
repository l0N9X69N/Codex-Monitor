import https from 'node:https';
import { LATEST_RELEASE_API_URL, PRODUCT_VERSION, RELEASES_URL } from './meta.js';

function parseVersion(value) {
  const match = String(value ?? '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+](.*))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null
  };
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease == null) return 1;
  if (b.prerelease == null) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true, sensitivity: 'base' });
}

function requestJson(url, { timeoutMs = 2500, httpsRef = https } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpsRef.get(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'codex-monitor-update-check'
      }
    }, (response) => {
      let raw = '';
      response.setEncoding?.('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`release metadata HTTP ${response.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('release metadata JSON invalid')); }
      });
    });
    request.on?.('socket', (socket) => socket?.unref?.());
    request.setTimeout?.(timeoutMs, () => request.destroy(new Error('release metadata request timed out')));
    request.on('error', reject);
  });
}

export async function checkForUpdates({
  currentVersion = PRODUCT_VERSION,
  apiUrl = LATEST_RELEASE_API_URL,
  releasesUrl = RELEASES_URL,
  fetchJson = requestJson
} = {}) {
  try {
    const release = await fetchJson(apiUrl);
    const latestVersion = String(release?.tag_name ?? release?.name ?? '').replace(/^v/i, '');
    const comparison = compareVersions(latestVersion, currentVersion);
    return {
      ok: true,
      currentVersion,
      latestVersion: latestVersion || null,
      updateAvailable: comparison === 1,
      releaseUrl: typeof release?.html_url === 'string' ? release.html_url : releasesUrl,
      error: null
    };
  } catch {
    return {
      ok: false,
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: releasesUrl,
      error: 'update-check-unavailable'
    };
  }
}

export function printUpdateReport(report, stream = process.stdout) {
  if (!report?.ok) {
    stream.write(`Codex Monitor ${report?.currentVersion ?? PRODUCT_VERSION}\n`);
    stream.write('Update check unavailable. Codex Monitor remains usable; no update was installed.\n');
    stream.write(`Releases: ${report?.releaseUrl ?? RELEASES_URL}\n`);
    return;
  }
  stream.write(`Codex Monitor ${report.currentVersion}\n`);
  stream.write(`Latest release: ${report.latestVersion ?? 'unknown'}\n`);
  stream.write(report.updateAvailable ? 'Update available. Auto-install is disabled.\n' : 'You are up to date.\n');
  stream.write(`Releases: ${report.releaseUrl}\n`);
}
