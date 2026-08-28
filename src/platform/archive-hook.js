import { currentPlatform } from './common.js';

function quotePosix(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function windowsEncodedCommand(execPath, entryPath, marker) {
  // Keep the outer command quote-free. Codex Windows hook runners in the wild
  // may pass commands through cmd.exe /C, where embedded path quotes can break
  // before PowerShell/Node is reached. Paths live inside the encoded payload.
  // The wrapper is deliberately fail-open so Archive integration can never
  // block the official Codex prompt lifecycle.
  const script = `& ${quotePowerShell(execPath)} ${quotePowerShell(entryPath)} ${quotePowerShell(marker)}; exit 0`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`;
}

function posixCommand(execPath, entryPath, marker) {
  return `${quotePosix(execPath)} ${quotePosix(entryPath)} ${marker}`;
}

function decodedPowerShellCommand(command) {
  const match = String(command ?? '').match(/(?:^|\s)-EncodedCommand\s+([A-Za-z0-9+/=]+)(?:\s|$)/i);
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64').toString('utf16le');
  } catch {
    return null;
  }
}

export function buildPlatformArchiveHookCommands({
  execPath,
  entryPath,
  marker,
  platform = currentPlatform()
} = {}) {
  const posix = posixCommand(execPath, entryPath, marker);
  const windows = windowsEncodedCommand(execPath, entryPath, marker);
  return {
    command: platform === 'win32' ? windows : posix,
    // Keep commandWindows for hook runners that support an explicit Windows
    // override, while command remains canonical for runners that only read it.
    commandWindows: windows
  };
}

export function isOwnedArchiveHookHandler(handler, marker) {
  if (handler?.type !== 'command') return false;
  for (const candidate of [handler?.command, handler?.commandWindows]) {
    if (typeof candidate !== 'string') continue;
    if (candidate.includes(marker)) return true;
    const decoded = decodedPowerShellCommand(candidate);
    if (decoded?.includes(marker)) return true;
  }
  return false;
}
