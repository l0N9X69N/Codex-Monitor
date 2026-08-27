import fs from 'node:fs';

const manifestUrl = new URL('../../package.json', import.meta.url);

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestUrl, 'utf8'));
  } catch {
    return {};
  }
}

const manifest = readManifest();

export const PRODUCT_NAME = 'Codex Monitor';
export const PACKAGE_NAME = String(manifest.name || 'codex-monitor');
export const PRODUCT_VERSION = String(manifest.version || '0.0.0');
export const PRODUCT_REPOSITORY = 'l0N9X69N/Codex-Monitor';
export const RELEASES_URL = `https://github.com/${PRODUCT_REPOSITORY}/releases`;
export const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${PRODUCT_REPOSITORY}/releases/latest`;
