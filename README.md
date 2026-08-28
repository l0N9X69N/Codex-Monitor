# Codex Monitor

Codex Monitor is a local-first wrapper and terminal monitor for the official OpenAI Codex CLI.

The v1 product has two primary surfaces:

- **Live Monitor** — a passive HUD around the official Codex process. After Codex starts, Codex owns 100% of stdin.
- **Session Manager** — an independent TUI for local session inspection, storage controls, analytics, configuration and the optional Local Session Archive.

## Requirements

- Node.js `>=22.13 <27`
- npm
- official `codex` CLI available on `PATH`

Node 22.13+ is required because Local Session Archive uses Node's built-in `node:sqlite` runtime. No external SQLite executable or native SQLite npm addon is required.

## Install from GitHub on Windows

Run this from PowerShell:

```powershell
irm https://raw.githubusercontent.com/l0N9X69N/Codex-Monitor/v1-rearchitecture/install.ps1 | iex
```

The bootstrap installer installs a supported Node.js runtime when needed, downloads Codex Monitor, installs dependencies, exposes the command family, and preserves existing Monitor config/Archive data across upgrades.

After installation:

```powershell
codexmctl doctor
codexmh
codexm
```

## Install from an existing repository checkout

```powershell
npm run install:windows
```

For manual development setup:

```powershell
npm install
npm link
```

## Command family

```text
codexm              Live Monitor + official Codex
codexmm             Session Manager
codexmc             Shared Config
codexmh             Codex Monitor help
codexmctl            Diagnostics / repair / update / uninstall / product controls
```

`codexm` is intentionally a transparent Codex wrapper. Every argument belongs to official Codex and is forwarded in original order:

```powershell
codexm -h
codexm -v
codexm -m gpt-5
codexm -c model_reasoning_effort=high
codexm resume -m gpt-5
```

Codex Monitor does not reserve `-m`, `-c`, `-h`, `-v`, `--help`, `--version`, or other Codex flags in the `codexm` entrypoint.

Monitor-specific commands use their own namespace:

```text
codexmm --view charts
codexmc --reset
codexmctl doctor
codexmctl repair
codexmctl update
codexmctl uninstall
codexmctl version
codexmctl config
codexmctl config-path
```

`codexmh`, `codexmm -h`, `codexmc -h`, and `codexmctl` display help in the Monitor language selected during initial setup (`vi` or `en`).

## First run and configuration

A clean interactive **bare** `codexm` launch runs initial setup before official Codex starts. If the invocation already contains Codex arguments, onboarding does not intercept them; for example `codexm -h` always belongs to official Codex.

`Manager -> C` and `codexmc` use the same Config controller and persisted state. Runtime Manager view cycling with `V` does not silently change the saved default.

Reset with `codexmc --reset` affects Monitor preferences only. It does not delete or modify official Codex login/auth, Codex session JSONL, or the Local Session Archive database.

## Local Session Archive

Archive is **optional, local-only, and Disabled by default**. Enabling it is an explicit Config action.

Data ownership model:

```text
Codex JSONL     = Codex-owned raw source
Archive SQLite  = Monitor-owned technical analytics archive
```

Archive hooks and filesystem watching are wake-up signals only. Reconcile against JSONL + committed offsets is the correctness mechanism, so missed signals must not mean missed data.

Disabling Archive stops/removes Monitor-owned background integration while keeping the SQLite database. `Clear Archive` is not the same as deleting Codex sessions.

## Updates

When enabled in Config, background update checks are throttled to approximately once per 24 hours and query GitHub Releases only. They do not auto-install updates and do not upload prompts, project data, tokens, session content or archive content.

Run an explicit check with:

```powershell
codexmctl update
```

## Uninstall

For an installation created by the GitHub bootstrap, run this directly from PowerShell:

```powershell
irm https://raw.githubusercontent.com/l0N9X69N/Codex-Monitor/v1-rearchitecture/uninstall.ps1 | iex
```

From a repository/source installation on Windows you can instead run:

```powershell
npm run uninstall:windows
```

The Monitor config and Archive database are preserved. Official Codex auth and sessions are never removed.

## Verification

```powershell
npm run verify:phase13
```

Build a release package and SHA256 checksum:

```powershell
npm run release:artifact
```

Release artifacts are written under `dist/`, which is gitignored.

## Documentation

See:

- `docs/CLI.md`
- `docs/CONFIGURATION.md`
- `docs/MANAGER.md`
- `docs/LOCAL-SESSION-ARCHIVE.md`
- `docs/TROUBLESHOOTING.md`
- `docs/RELEASE-MANUAL-CHECKLIST.md`
- `SECURITY.md`
- `PRIVACY.md`

`PROJECT-SPEC.md` remains the top-level product source of truth. Accepted decision docs and numbered RoadMap phases provide newer execution semantics where explicitly stated.
