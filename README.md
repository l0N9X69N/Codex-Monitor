# Codex Monitor

Codex Monitor is a local-first terminal companion for the official OpenAI Codex CLI.

It keeps the official Codex process in control while adding a passive Live Monitor, a local Session Manager, shared configuration, diagnostics, and an optional local SQLite archive for session analytics.

> Codex Monitor is an independent project. It does not replace, bundle, patch, or modify the official Codex CLI.

## What it adds

### Live Monitor

Run Codex through `codexm` to get a responsive terminal HUD around the official Codex process.

The HUD can show:

- current activity/state;
- model and reasoning information when available;
- project/session information;
- context usage and remaining context;
- account usage/quota information when exposed by local Codex session data;
- session age, turns and freshness;
- optional CPU/RAM/system telemetry;
- optional Git information in the Full/Custom layouts.

Once Codex starts, normal keyboard input belongs to official Codex. `codexm` does not reserve its own short or long flags.

### Session Manager

`codexmm` opens an independent terminal UI for inspecting local Codex sessions.

It includes multiple views for operational status, tables and charts, plus session detail, local storage tools and Archive-backed analytics when Archive is enabled.

### Shared Config

`codexmc` opens the same Monitor configuration used by Live Monitor and Session Manager.

Configuration includes:

- language: Vietnamese or English;
- presets: Recommended, Compact, Full and Custom;
- themes: Color, Cyberpunk, Mono and Matrix;
- terminal/background presentation;
- System telemetry visibility;
- individual HUD sections and fields;
- Manager default view;
- optional Local Session Archive;
- update-check preference.

Changes are persisted only after Save.

### Local Session Archive

The Archive is optional and disabled by default.

When enabled, it builds a Monitor-owned SQLite analytics index from Codex-owned local JSONL session files. The raw Codex session files remain the source of truth.

Archive processing is local-only and does not call a model or consume API tokens.

## Requirements

For the current Windows release:

- Windows with PowerShell;
- Node.js `>=22.13 <27`;
- npm;
- official `codex` CLI available on `PATH` for Live Monitor usage.

Node.js 22.13+ is required because Local Session Archive uses the built-in `node:sqlite` runtime.

Codex Monitor does not install or update official Codex.

## Install on Windows

Open PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/l0N9X69N/Codex-Monitor/main/install.ps1 | iex
```

The installer downloads the current `main` source and installs Codex Monitor under:

```text
%LOCALAPPDATA%\CodexMonitor\app
```

It then installs dependencies with `npm ci` and registers the five Monitor commands globally through npm.

### Node/npm ownership rules

The installer is deliberately conservative with shared runtimes:

- if a supported Node.js + npm installation already exists, it is reused unchanged;
- if both Node.js and npm are absent, the installer may install the current Node.js LTS package through `winget`;
- if Node.js exists but is unsupported, incomplete, or missing npm, installation stops instead of replacing the user's shared runtime;
- uninstall never removes Node.js or npm, even if the Monitor installer originally installed them, because other software may depend on them later.

After installation, verify the environment:

```powershell
codexmctl doctor
codexmctl version
codexmh
```

Then start Codex Monitor:

```powershell
codexm
```

## Commands

| Command | Purpose |
| --- | --- |
| `codexm` | Run official Codex with the passive Live Monitor |
| `codexmm` | Open Session Manager |
| `codexmc` | Open shared Monitor Config |
| `codexmh` | Show localized Codex Monitor help |
| `codexmctl` | Diagnostics, repair, update checks and product information |

### `codexm` is transparent

Every argument passed to `codexm` belongs to official Codex and is forwarded in the original order.

Examples:

```powershell
codexm -h
codexm --version
codexm -m gpt-5
codexm resume
codexm resume --last
```

Codex Monitor intentionally owns no short or long flags on the `codexm` entrypoint. This keeps it compatible with current and future official Codex CLI arguments.

Monitor-specific functionality lives in the other commands.

## First run

On a clean installation, the first bare interactive command:

```powershell
codexm
```

opens Initial Setup before official Codex starts.

Setup lets the user choose the Monitor language, presentation preset and related preferences. After Save, Codex starts normally.

If `codexm` is invoked with Codex arguments, Monitor does not intercept the invocation for onboarding.

## Live Monitor presets

### Recommended

Balanced default intended for everyday use. Core cards are always prioritized. System telemetry uses automatic layout behavior and is shown only when the terminal has enough horizontal space.

### Compact

Reduces optional information for smaller terminals. System telemetry is disabled by default.

### Full

Enables the widest set of Monitor information, including System telemetry and optional Git-oriented information.

### Custom

Allows individual sections, metrics and fields to be selected explicitly.

The HUD is responsive. Terminal size can change the number of cards per row and whether optional information is visible.

## System telemetry

When enabled, the System card reads lightweight local machine telemetry such as CPU, RAM and capacity information through the platform adapter.

CPU/RAM history is kept only as a bounded in-memory ring buffer for the live graph. It is not sent to OpenAI or another external service by Codex Monitor.

## Session Manager

Open Manager with:

```powershell
codexmm
```

Choose a temporary view for one run:

```powershell
codexmm --view operations
codexmm --view table
codexmm --view charts
codexmm --view auto
```

Useful Manager controls include:

```text
C   Config
M   Storage
V   Cycle Manager view
```

Additional keys are shown in the Manager UI according to the active screen.

## Config

Open Config directly:

```powershell
codexmc
```

Reset Monitor preferences with confirmation:

```powershell
codexmc --reset
```

The reset affects Codex Monitor preferences only. It does not delete Codex authentication or Codex session files.

To inspect the effective config from a normal shell:

```powershell
codexmctl config
codexmctl config-path
```

## Local Session Archive

Archive can be enabled from Config.

Conceptually:

```text
Codex JSONL files   -> Codex-owned raw session source
Monitor SQLite      -> Monitor-owned local analytics/index data
```

The Archive service reconciles local Codex session files into SQLite using committed offsets. Hook/filesystem signals are only wake-up mechanisms; reconciliation against the local source files provides correctness.

If an Archive hook or service integration becomes stale after an update, run:

```powershell
codexmctl repair
```

Official Codex may still require the user to review/trust a modified hook through its own hook UI. Codex Monitor does not bypass official Codex trust controls.

## Diagnostics

Run local diagnostics:

```powershell
codexmctl doctor
```

`diagnostics` is also accepted as an alias:

```powershell
codexmctl diagnostics
```

Diagnostics are designed to report product/runtime health without intentionally printing secrets such as authentication tokens.

## Update checks

Check for a newer GitHub release:

```powershell
codexmctl update
```

The update command checks only. Codex Monitor does not silently install a new version.

Background update checks are throttled and can be disabled from Config.

## Uninstall

Run the external uninstaller from PowerShell:

```powershell
irm https://raw.githubusercontent.com/l0N9X69N/Codex-Monitor/main/uninstall.ps1 | iex
```

The uninstaller removes only Monitor-owned installation/integration components, including:

- Monitor Archive hook/service integration when available;
- global `codex-monitor` npm package/link registration;
- Monitor-owned command shims;
- the recognized installed source at `%LOCALAPPDATA%\CodexMonitor\app`.

It deliberately preserves:

- Node.js and npm;
- official Codex CLI;
- Codex authentication;
- Codex session files;
- Codex Monitor configuration;
- Local Session Archive SQLite data.

This preservation policy makes reinstall/update recovery safer and avoids deleting user-owned data.

## Local data and privacy

Codex Monitor is designed around local data.

It reads local Codex/session/runtime information needed for the selected Monitor features. Optional Archive data is stored locally in SQLite. Archive analysis does not invoke an AI model.

The product's update checker may contact GitHub Releases to determine whether a newer Codex Monitor version exists. It does not auto-install updates.

See `PRIVACY.md` and `SECURITY.md` for the repository policies.

## Installation troubleshooting

### `codexm` is not found after install

Open a new PowerShell window first, then check:

```powershell
Get-Command codexm,codexmm,codexmc,codexmh,codexmctl
npm prefix -g
```

### Monitor appears to run an older build

Check which shim PowerShell resolves:

```powershell
Get-Command codexm | Format-List Source
```

The GitHub installer installs source under:

```text
%LOCALAPPDATA%\CodexMonitor\app
```

Re-run the installer from `main` to refresh the installed source and npm link.

### Official Codex is missing

Check:

```powershell
Get-Command codex
codex --version
```

Codex Monitor can be installed without Codex, but `codexm` cannot provide the normal Live Monitor workflow until official Codex is installed and available on `PATH`.

### Archive hook changed after an update

Run:

```powershell
codexmctl repair
```

Then review official Codex hook trust if Codex marks the hook as modified/untrusted.

## Development

Clone the repository and install the locked dependencies:

```powershell
git clone https://github.com/l0N9X69N/Codex-Monitor.git
cd Codex-Monitor
npm ci
```

Run the complete Node test suite:

```powershell
npm test
```

Run the current release verification gate:

```powershell
npm run verify:phase13
```

Run syntax checks:

```powershell
npm run check
```

The test tree includes unit, integration, fuzz, fixtures and snapshot coverage for the v1 architecture.

## Project principles

Codex Monitor v1 follows a few strict boundaries:

1. **Official Codex owns its CLI arguments and interactive input.**
2. **Monitor-specific features use separate commands instead of stealing Codex flags.**
3. **Codex-owned sessions/authentication remain user data and are never owned by Monitor.**
4. **Optional Archive analytics remain local.**
5. **Install/uninstall operations are external scripts, not self-removing CLI commands.**
6. **Shared runtimes such as Node.js/npm are treated conservatively.**

## License

MIT. See `LICENSE`.
