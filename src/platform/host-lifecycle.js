export function completeHostExit(code, {
  processRef = process,
  platform = process.platform
} = {}) {
  const normalizedCode = Number.isFinite(code) ? code : 0;

  // @homebridge/node-pty-prebuilt-multiarch@0.14.1 can leave its Windows
  // ConPTY ConoutConnection worker/socket handles referenced after the PTY
  // process has already emitted onExit. In that state Codex is gone and our
  // terminal cleanup has completed, but the Node host remains alive until the
  // user presses Ctrl+C again. The wrapper has no useful work left at this
  // point, so terminate the host explicitly on Windows.
  if (platform === 'win32' && typeof processRef?.exit === 'function') {
    processRef.exit(normalizedCode);
    return normalizedCode;
  }

  if (processRef) processRef.exitCode = normalizedCode;
  return normalizedCode;
}
