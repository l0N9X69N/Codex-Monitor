let revision = 0;
let config = null;

function clone(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

export function publishManagerArchiveConfig(nextConfig) {
  revision += 1;
  config = clone(nextConfig);
  return revision;
}

export function managerArchiveConfigState() {
  return { revision, config: clone(config) };
}
