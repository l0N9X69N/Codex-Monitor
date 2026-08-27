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

The bootstrap installer:

- installs a supported Node.js LTS through `winget` when Node/npm are missing or unsupported;
- uses the npm bundled with Node.js, so npm does not need a separate installer;
- downloads Codex Monitor from GitHub;
- installs it under `%LOCALAPPDATA%\CodexMonitor\app`;
- safely replaces only recognized Codex Monitor-owned `codexm` shims;
- installs dependencies, links `codexm`, and runs a version smoke test;
- preserves the previous source installation and attempts rollback if the new install fails.

If `winget` is unavailable, install Node.js `>=22.13 <27` manually and run the same command again.

After installation:

```powershell
codexm --doctor
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

For source-runtime testing without linking:

```powershell
node ./src/cli/codexm.js
```

## Core commands

```text
codexm                              Live Monitor + official Codex
codexm --manager                    Session Manager
codexm --configure                  Shared Config
codexm --reset                      Reset Monitor preferences only
codexm --config                     Print effective Monitor config
codexm --config-path                Print Monitor config path
codexm --doctor / --diagnostics     Sanitized local diagnostics
codexm --repair                     Repair Monitor-owned Archive integration
codexm --update                     Check GitHub Releases; never auto-installs
codexm --uninstall                  Remove Monitor-owned integration only
codexm --version                    Codex Monitor version
```

Unknown Codex arguments are forwarded unchanged. Use `--` for an exact passthrough boundary:

```powershell
codexm -- --version
codexm -- --help
```

There is no Monitor-owned `--history` command in v1.

## First run and configuration

A clean interactive launch runs first-run setup before Manager or official Codex starts. Existing valid Monitor configs migrate without being forced through onboarding again.

`Manager -> C` and `codexm --configure` use the same Config controller and persisted state. Runtime Manager view cycling with `V` does not silently change the saved default.

Reset affects Monitor preferences only. It does not delete or modify official Codex login/auth, Codex session JSONL, or the Local Session Archive database.

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
codexm --update
```

## Uninstall

From a repository/source installation on Windows:

```powershell
npm run uninstall:windows
```

The Windows uninstaller runs the built-in `codexm --uninstall` integration cleanup first, then removes the global npm package/link and recognized stale Codex Monitor shims.

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