# Codex Monitor

Codex Monitor is a local-first wrapper and terminal monitor for the official OpenAI Codex CLI.

The v1 product has two primary surfaces:

- **Live Monitor** — a passive HUD around the official Codex process. After Codex starts, Codex owns 100% of stdin.
- **Session Manager** — an independent TUI for local session inspection, storage controls, analytics, configuration and the optional Local Session Archive.

## Requirements

- Node.js `>=22.13 <27`
- npm
- official `codex` CLI available on `PATH`

Node 22.13+ is required because Local Session Archive uses Node's built-in `node:sqlite` runtime.

## Install from GitHub on Windows

Run this from PowerShell:

```powershell
irm https://raw.githubusercontent.com/l0N9X69N/Codex-Monitor/v1-rearchitecture/install.ps1 | iex
```

`install.ps1` is the only public installer. It downloads the latest source from the configured GitHub ref and installs Monitor dependencies from `package-lock.json` with `npm ci`.

Shared-runtime safety:

- if a supported Node/npm already exists, it is reused and never upgraded/replaced by the installer;
- if Node/npm are both absent, the installer may install the current Node.js LTS package through `winget` (npm is bundled with Node);
- if an existing Node installation is unsupported or incomplete, installation stops and asks the user to repair/update it manually rather than modifying a shared runtime;
- official Codex is never installed, upgraded or modified by Codex Monitor.

After installation:

```powershell
codexmctl doctor
codexmh
codexm
```

## Command family

```text
codexm              Live Monitor + official Codex
codexmm             Session Manager
codexmc             Shared Config
codexmh             Codex Monitor help
codexmctl            Diagnostics / repair / update / product controls
```

`codexm` is intentionally a transparent Codex wrapper. Every argument belongs to official Codex and is forwarded in original order.

Monitor-specific commands use their own namespace:

```text
codexmm --view charts
codexmc --reset
codexmctl doctor
codexmctl repair
codexmctl update
codexmctl version
codexmctl config
codexmctl config-path
```

Install/uninstall are intentionally **not** CLI commands. This avoids a running executable trying to remove itself and keeps product ownership logic in one external entrypoint.

`codexmh`, `codexmm -h`, `codexmc -h`, and `codexmctl` display help in the Monitor language selected during initial setup (`vi` or `en`).

## First run and configuration

A clean interactive **bare** `codexm` launch runs initial setup before official Codex starts. If the invocation already contains Codex arguments, onboarding does not intercept them.

`Manager -> C` and `codexmc` use the same Config controller and persisted state. Reset with `codexmc --reset` affects Monitor preferences only.

## Local Session Archive

Archive is optional, local-only, and Disabled by default.

```text
Codex JSONL     = Codex-owned raw source
Archive SQLite  = Monitor-owned technical analytics archive
```

Archive hooks and filesystem watching are wake-up signals only. Reconcile against JSONL + committed offsets is the correctness mechanism.

## Updates

`codexmctl update` checks for a newer Monitor release but never installs it automatically. Background checks are throttled and can be disabled in Config.

## Uninstall

Run the external GitHub uninstaller:

```powershell
irm https://raw.githubusercontent.com/l0N9X69N/Codex-Monitor/v1-rearchitecture/uninstall.ps1 | iex
```

`uninstall.ps1` removes only Codex Monitor-owned integration, the global `codex-monitor` npm link/package registration, Monitor-owned command shims, and the recognized source directory under `%LOCALAPPDATA%\CodexMonitor\app`.

It deliberately preserves shared/system tools and user data:

- Node.js and npm — even when the installer originally had to install them, because other software may now depend on them;
- official Codex CLI;
- Codex auth and Codex sessions;
- Monitor config;
- Local Session Archive SQLite database.

## Verification

```powershell
npm run verify:phase13
```

See `docs/CLI.md`, `docs/CONFIGURATION.md`, `docs/MANAGER.md`, `docs/LOCAL-SESSION-ARCHIVE.md`, `docs/TROUBLESHOOTING.md` and `docs/RELEASE-MANUAL-CHECKLIST.md` for details.
