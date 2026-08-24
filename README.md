# Codex Monitor v1.0.0

A lightweight Windows terminal monitor for the **official OpenAI Codex CLI**.

Codex Monitor does not patch, rebuild, or replace Codex. It launches your
existing `codex` process inside the same terminal through ConPTY and reserves a
small monitor area at the bottom of the terminal.

It reads local Codex session/rollout data and the live PTY stream. Monitoring
does **not** make additional model/API requests.

## Profiles

The v1 architecture exposes the four profiles agreed for the project:

| Command | UI | Authentication profile | Purpose |
| --- | --- | --- | --- |
| `codexm-l-a` | Lite | API key | Small monitor for API-key users |
| `codexm-l-l` | Lite | ChatGPT login | Small monitor for logged-in accounts |
| `codexm-f-a` | Full | API key | Full four-column monitor for API-key users |
| `codexm-f-l` | Full | ChatGPT login | Full four-column monitor for logged-in accounts |
| `codexm` | Full | ChatGPT login | Default alias; equivalent to `codexm-f-l` |

`l` = lite, `f` = full, `a` = API key, `l` in the final position = login.

The selected profile is applied only to the Codex child process. It does not
rewrite your persistent Codex configuration.

## Full monitor

On a terminal that is at least 120 columns wide and has enough vertical space,
the full profiles render the table layout:

```text
╭─ CODEX MONITOR · FULL ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ ◆ TOOL running tool · gpt-5.6-luna · medium · my-project · git:main +3 · AUTH LOGIN · SESSION 12m · TURN 8 · DUR 7.4s · UPD 2s                                                   │
├────────────────────────────────────────────┬────────────────────────────────────────────┬────────────────────────────────────────────┬───────────────────────────────────────────┤
│ CONTEXT                                    │ USAGE · LOGIN                              │ SESSION                                    │ CURRENT ACTIVITY                          │
│ 27% used · 79K/258K                        │ 5h 64% left ↻ 3h42m                        │ elapsed 12m · turns 8                      │ ◆ TOOL running tool                       │
│ ━━━━━━━━────────────────────               │ Week 82% left ↻ 6d06h                      │ last 7.4s · update 2s                      │ source rollout · detail running shell     │
│ CACHE 3.96M 97%                            │ IN 4.07M · OUT 5.9K                        │ git main +3                                │ tools 1 · last shell                      │
│ LEFT 73% · CMP 2                           │ RSN 644 · TURN 49.5K in / 5 out            │ thread abcdef123456 · codex 0.99.0         │ approval false · retry 0 · err 0          │
╰────────────────────────────────────────────┴────────────────────────────────────────────┴────────────────────────────────────────────┴───────────────────────────────────────────╯
```

If the terminal is too narrow or too short, a full profile automatically falls
back to the lite monitor instead of crushing the Codex content area.

## What the full monitor shows

### Context

- effective context percentage using Codex's 12K baseline convention;
- current context tokens / model context window;
- context usage bar and percentage left;
- cached input tokens and cache percentage;
- compaction count.

### Usage

- rolling 5-hour quota when Codex supplies it;
- rolling weekly quota;
- reset countdowns;
- total input/output/reasoning tokens;
- latest turn input/output token snapshot.

If the 5-hour window is not present in current Codex data, it shows
`5h waiting…` rather than inventing a value.

### Session

- elapsed wrapper session time;
- turn count;
- last completed turn duration;
- age of the newest session event;
- Git branch and dirty-path count;
- thread ID prefix;
- observed Codex CLI version when available.

### Current activity

The state priority is:

```text
ERROR > APPROVAL > TOOL > THINKING > IDLE
```

The monitor combines two sources:

- **rollout JSONL** for durable turn/token/tool state;
- **live PTY output** for transient approval/error UI that current Codex does
  not persist in rollout history.

The activity panel also shows the source (`rollout`, `pty`, or `demo`), current
activity detail, active tool count, most recent tool kind, retries, and errors.

## Installation

### Requirements

- Windows 10/11 with ConPTY support;
- Node.js **20-26**;
- npm on `PATH`;
- official OpenAI Codex CLI already installed and working as `codex`.

Check first:

```powershell
node --version
npm --version
codex --version
```

### 1. Clone

```powershell
git clone https://github.com/l0N9X69N/Codex-Monitor.git
cd Codex-Monitor
```

Or download the repository ZIP and open a terminal in the extracted folder.

### 2. Install

Recommended:

```powershell
.\install.cmd
```

Or directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

The installer:

1. checks Node.js, npm, and official Codex;
2. packs this project into a temporary npm tarball;
3. installs the tarball globally together with the prebuilt ConPTY helper;
4. registers all five commands;
5. runs `codexm --doctor`.

The install is **standalone**. It does not create a permanent npm link back to
the cloned repository, so you may delete the cloned source directory after a
successful installation.

The installer does not build Rust/C++ and does not compile Codex.

### 3. Verify

```powershell
codexm --doctor
codexm --codexm-profile
```

Expected default profile:

```text
codexm-f-l    Full · Login
```

If the command is not visible immediately, close the terminal and open a new
one so the npm global `PATH` is refreshed.

## Usage

Default full + login:

```powershell
codexm
```

Explicit profiles:

```powershell
codexm-f-l
codexm-f-a
codexm-l-l
codexm-l-a
```

Normal Codex arguments are passed through:

```powershell
codexm resume
codexm-f-l resume
codexm-f-a --help
```

The official unwrapped CLI remains available:

```powershell
codex
```

## Authentication behavior

### Login profiles: `codexm` / `codexm-f-l` / `codexm-l-l`

The child Codex process receives a temporary config override equivalent to:

```toml
forced_login_method = "chatgpt"
```

`CODEX_API_KEY` is removed from the child environment so an ambient key does
not unexpectedly override the Login profile. Your parent shell environment is
not changed.

### API profiles: `codexm-f-a` / `codexm-l-a`

The child receives:

```toml
forced_login_method = "api"
```

If `CODEX_API_KEY` is set, it is passed through. If only `OPENAI_API_KEY` is
set, the wrapper mirrors it to `CODEX_API_KEY` **for the child process only**.
If neither variable is set, Codex can still use an API-key login already stored
by Codex itself.

No key value is printed by the monitor.

## Demo / UI testing

Cycle through all states without launching Codex:

```powershell
codexm --demo
```

The full default demo cycles:

```text
IDLE -> THINKING -> TOOL -> APPROVAL -> ERROR
```

Hold one state:

```powershell
codexm --demo-state IDLE
codexm --demo-state THINKING
codexm --demo-state TOOL
codexm --demo-state APPROVAL
codexm --demo-state ERROR
```

You can test every UI/profile combination too:

```powershell
codexm-f-a --demo
codexm-l-l --demo
```

## Updating

From the cloned repository:

```powershell
git pull
.\install.cmd
```

The installer replaces the global package with the newly packed version.

## Uninstall

Recommended, from the repository folder:

```powershell
.\uninstall.cmd
```

or:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1
```

If you already deleted the repository, remove it from any terminal with:

```powershell
npm uninstall -g codex-monitor-wrapper
```

Uninstalling Codex Monitor does **not** remove or modify:

- the official `codex` CLI;
- your ChatGPT/Codex login state;
- `%USERPROFILE%\.codex`;
- Codex session/history data.

After uninstalling, verify:

```powershell
Get-Command codexm -ErrorAction SilentlyContinue
codex --version
```

The first command should return nothing; the second should continue to work.

## Data and privacy

Codex Monitor reads:

- local Codex rollout/session JSONL under `%CODEX_HOME%\sessions` or
  `%USERPROFILE%\.codex\sessions`;
- Git branch/status from the current working directory;
- the PTY output already produced by the Codex process it launched.

It does not send separate monitoring telemetry and makes no additional model
requests for quota/token/state information.

## Refresh behavior

- dashboard repaint: about 250 ms;
- active rollout stat check: about 100 ms;
- search for a new/current rollout: about 400 ms;
- Git branch/dirty refresh: about 3 seconds.

The active rollout is reread only when its modification time or file size
changes.

## Scroll safety

The wrapper reserves a real terminal scroll region above the dashboard using
DECSTBM. Long Codex responses scroll inside the Codex area rather than under the
monitor. The normal terminal scroll region is restored when Codex Monitor exits.

## Diagnostics

```powershell
codexm --doctor
```

The diagnostic report includes:

- monitor version and selected profile;
- auth source summary (never the secret);
- Node version;
- resolved Codex executable;
- Codex sessions directory;
- active rollout;
- quota/token availability;
- current activity state;
- PTY module load status.

## Development

Tests do not require a live Codex session:

```powershell
npm test
```

Syntax checks:

```powershell
npm run check
```

The test suite covers the four-profile architecture, auth child environment,
quota parsing, context math, tool lifecycle state, full table rendering, PTY
approval detection, stale-approval prevention, and conservative error detection.

## License

MIT.
