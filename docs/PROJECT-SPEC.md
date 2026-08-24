# Codex Monitor — Final Project Specification v1

**Project:** Codex Monitor  
**Primary command:** `codexm`  
**Design freeze:** 2026-08-24  
**Status:** Final product/UI/CLI baseline for v1  
**Purpose of this file:** Local backup / source-of-truth snapshot of the decisions finalized for the Codex Monitor project.

> This document consolidates the original “Codex Monitor — Core, UI/UX & Product Specification” with all decisions finalized afterward in the project discussion. Where a later decision conflicts with an earlier idea, this document wins for v1.

---

# 1. Product definition

Codex Monitor is a lightweight, local-first wrapper around the **official Codex CLI**.

It does **not** fork, modify, rebuild, or replace Codex. It launches the official Codex CLI under a PTY/ConPTY, observes only data available locally, normalizes that data, and renders a terminal monitor around the current Codex session.

The product has two major modes:

```text
CODEX MONITOR
│
├── codexm
│   └── LIVE MONITOR
│       ├── Official Codex
│       ├── responsive monitor pane
│       ├── current-run status/header
│       ├── live tabs
│       └── F4 → History
│
└── codexm --history
    └── HISTORY VIEWER
        ├── local Codex sessions
        ├── historical analytics
        ├── live-tail of a currently growing session
        ├── cyberpunk terminal dashboard
        └── manual storage/delete tools
```

The separation is strict:

```text
LIVE    = current Codex run only
HISTORY = Codex session files already stored locally
```

Live must never use old sessions to fill missing current-run values.

---

# 2. Hard product principles

These are v1 invariants.

1. **Official Codex remains official.** No fork or rebuilt Codex client.
2. **One wrapper, same terminal.** `codexm` runs Codex and adds monitoring around it.
3. **No extra model/API request for monitoring.**
4. **Live is current-run only.**
5. **No stale historical data is merged into the current run.**
6. **Show only what a reliable source provides. Do not invent telemetry.**
7. **Derived values must be clearly treated as derived, not official telemetry.**
8. **Responsive to terminal cells, width and height — not physical aspect ratio.**
9. **User chooses information; the layout engine chooses presentation.**
10. **One normalized state / one renderer semantics across presets.**
11. **Heavy work happens in collectors/background/cache, never inside the renderer.**
12. **Local-first and offline by default.**
13. **No hidden monitoring workload.**
14. **Same product semantics on Windows, Linux, and macOS.**

Four mandatory performance laws:

> **What you don't display, Codex Monitor doesn't collect.**

> **What you're not viewing, Codex Monitor doesn't continuously poll.**

> **What hasn't changed, Codex Monitor doesn't repaint.**

> **OS-specific behavior stays behind a Platform Adapter.**

---

# 3. Top-level architecture

```text
Official Codex CLI
      │
      ├── PTY / ConPTY live output
      ├── current rollout/session JSONL
      ├── auth/config/runtime signals
      └── local process lifecycle
              │
              ▼
        DATA COLLECTORS
              │
              ▼
      NORMALIZED MONITOR STATE
              │
              ▼
           VIEW MODEL
              │
      ┌───────┴─────────┐
      │                 │
  USER CONFIG        ACTIVE VIEW
      │                 │
      └───────┬─────────┘
              ▼
          DEMAND GRAPH
              │
              ▼
       COLLECTOR MANAGER
              │
              ▼
      RESPONSIVE LAYOUT
              │
              ▼
       ANSI DIFF RENDERER
              │
              ▼
          TERMINAL
```

Normalized state remains conceptually:

```text
NormalizedMonitorState
├── auth
├── model
├── context
├── usage
├── quota
├── session
├── activity
├── compaction
├── git
├── system
├── resources
└── freshness
```

There is no separate “Lite state” and “Full state”.

---

# 4. Cross-platform architecture

The product, semantics, layout, colors, commands, configuration model, History format, and normalized state are shared across:

- Windows
- Linux
- macOS

Only the low-level OS adapter is different.

```text
src/
├── core/
├── collectors/
├── history/
├── ui/
│
└── platform/
    ├── index
    ├── windows
    ├── linux
    └── macos
```

Core code should call interfaces such as:

```text
platform.spawnPty(...)
platform.getSystemUsage(...)
platform.getProcessTree(codexPid)
platform.getDiskInfo(path)
platform.openHistoryTerminal(...)
```

Core/UI code must not contain Windows/Linux/macOS conditionals scattered throughout the product.

Platform differences include:

| Concern | Windows | Linux | macOS |
|---|---|---|---|
| PTY | ConPTY | POSIX PTY | POSIX PTY |
| Process/system collection | Windows adapter | Linux adapter | macOS adapter |
| Signals / cleanup | Windows-specific handling | POSIX | POSIX |
| Paths | Windows conventions | XDG/home | macOS/home |
| F4 terminal launcher | Windows Terminal when detectable | terminal emulator adapter | Terminal/iTerm adapter |
| Packaging/signing | Windows package/signing | Linux package/binary | macOS package/signing |

If a platform feature is unavailable, the UI degrades gracefully instead of breaking Codex.

---

# 5. CLI contract

The main contract is:

```text
codexm [monitor options] [codex arguments]
```

Known Monitor flags are consumed by Codex Monitor. Everything else is passed unchanged to the official Codex CLI.

Examples:

```powershell
codexm
codexm resume
codexm -m <model>
codexm --preset compact resume
```

`--` is the mandatory escape hatch:

```powershell
codexm -- --help
```

Meaning:

- `codexm --help` → Codex Monitor help
- `codexm -- --help` → official Codex help

Monitor does **not** create positional subcommands such as `codexm login`, `codexm status`, or `codexm resume`. Those remain Codex arguments and pass through.

`codexm --version` should remain available to Codex where possible. Monitor uses `--monitor-version`.

---

# 6. Public CLI commands/options

## Core launch

```text
codexm
```

Launch official Codex + Live Monitor.

## History

```text
codexm --history
```

Open History Viewer only. Does **not** launch Codex.

```text
codexm -- --history
```

Pass `--history` to official Codex if that ever becomes necessary.

## Configuration

```text
codexm --configure
codexm --reset
codexm --config
codexm --config-path
```

- `--configure`: edit Monitor settings through interactive setup.
- `--reset`: reset Monitor settings and rerun onboarding.
- `--config`: show effective Monitor config.
- `--config-path`: show config location.

`--reset` never deletes official Codex config/auth/history.

## Runtime overrides

```text
codexm --preset <recommended|compact|full|custom>
codexm --theme <color|mono|matrix>
codexm --lang <vi|en>
codexm --auth <auto|api|login>
```

Runtime override values are for the current invocation unless saved through configuration.

## Diagnostics / repair

```text
codexm --doctor
codexm --diagnostics
codexm --repair
```

- `--doctor`: lightweight health checks.
- `--diagnostics`: sanitized diagnostic report; never print secrets.
- `--repair`: repair Monitor runtime/shim/PTY/config migration problems.

## Version / update

```text
codexm --monitor-version
codexm --check-update
codexm --update
```

Optional advanced setting:

```text
codexm --no-update-check
```

## Uninstall

```text
codexm --uninstall
```

Removes Codex Monitor only.

It must never remove:

- official Codex CLI
- Codex authentication
- `~/.codex/sessions`
- Codex config/history

## Development/demo options

May remain available as advanced/development utilities:

```text
codexm --demo
codexm --demo-state <idle|thinking|tool|approval|error>
```

---

# 7. Authentication behavior

Target default is automatic detection.

Order:

```text
1. explicit --auth override
2. suitable API-key environment
3. official Codex auth/status/stored auth
4. launch official Codex
5. verify again when current session appears
```

Supported normalized modes:

```text
login
api
other / unknown
```

Manual override:

```powershell
codexm --auth api
codexm --auth login
```

Old four-profile naming is not part of the v1 product UX.

---

# 8. Current-run hard reset

At every new `codexm` process start, all current-session/runtime telemetry is reset.

Values that must start as unknown until the **current run** reports them include:

```text
CONTEXT
TOKEN USAGE
CACHE
TURN
THREAD
LAST DUR
COMPACTION
LAST COMPACT
TASK PLAN
ACTUAL MODEL
5H QUOTA
WEEK QUOTA
TOOLS
RETRY
ERROR
```

Semantics:

```text
0  = source reported an actual zero
-- = current run has not provided the value yet
```

Login quota also starts as `--`.

Monitor must not scan prior rollout files merely to fill missing current quota.

API sessions must never inherit Login quota.

---

# 9. Model semantics

Keep requested/current model separate from effective/server model.

```text
MODEL   = requested/current model if known
ACTUAL  = effective/server model only with reliable evidence
```

Never assume:

```text
ACTUAL = MODEL
```

Without reliable evidence:

```text
ACTUAL --
```

Third-party gateway/base URL is not proof of the actual backend model.

---

# 10. Quota and usage semantics

## Login mode

May show, when current-run evidence exists:

```text
5H quota
WEEK quota
tokens
cache
turn usage
context
```

Primary visual hierarchy for quota:

```text
5H    ━━━━━━━━━━━━━━────── 64% left   ↻ 3h42m
WEEK  ━━━━━━━━━━━━━━━━━─── 82% left   ↻ 6d06h
```

## API mode

May show:

```text
requested model
actual model if proven
input
cached input
output
reasoning
turn usage
context
```

Must not show Login quota as API quota.

## Cost

Money/cost estimation is **not a v1 feature**.

No:

- token × bundled pricing
- LiteLLM pricing download
- OpenAI/Anthropic pricing lookup
- remote price metadata
- maintenance-heavy model pricing database

If cost support is revisited later, it must be explicitly designed as a separate feature.

---

# 11. Live Monitor UI

`codexm` runs the official Codex CLI and maintains a lightweight responsive Monitor pane in the same terminal.

The Monitor pane consists of:

```text
LIVE MONITOR
├── Header
│   ├── left: critical runtime status
│   └── right: configured tabs
│
├── Active View
│
└── Footer
    └── F4 History
```

There is no F2 Inspector.

The previous “HUD vs Inspector” two-layer concept is replaced by one responsive multi-view Monitor interface.

---

# 12. Live header

The header is visually one bar but logically split into two regions:

```text
┌─ CODEX MONITOR ───────────────────────────────────────────────────────────┐
│ ● TOOL   gpt-5.x   high   Monitor-Cli   │   Overview   Tools   Resources │
└───────────────────────────────────────────────────────────────────────────┘
```

## Left side — status slots

Maximum:

```text
4 items
```

This prevents the header from becoming a telemetry dump.

Available header items:

```text
Activity
Model
Reasoning
Project
Git
Auth
Health
Session age
Fast
```

Default:

```text
Activity | Model | Reasoning | Project
```

Other data such as versions, detailed tokens, context, CPU/RAM, etc. belongs in views instead of the header.

## Right side — navigation

Only configured Live tabs are shown.

The navigation region has higher layout priority than optional status text. When width becomes limited, status representations shrink/disappear before navigation becomes unusable.

Example responsive representations:

```text
Wide:
● TOOL  gpt-5.x  high  Monitor-Cli │ Overview Performance Processes Tools Resources Usage

Medium:
● TOOL  gpt-5.x  Monitor-Cli       │ Overview Perf Proc Tools Res

Narrow:
● TOOL  gpt-5.x                    │ Ov Tools Res

Very narrow:
● TOOL                             │ Tools ›
```

No telemetry word wrapping.

---

# 13. Git header item

If Git is selected, it is one composite header item.

Possible full representation:

```text
main*  3 files  Δ+10 −1  ↑2 ↓1
```

Meaning:

- `main` → current branch
- `*` → working tree dirty
- `Δ+10 −1` → local working-tree added/deleted lines relative to HEAD
- `↑2 ↓1` → local ahead/behind based on known local remote refs; no network fetch

Recommended responsive levels:

```text
FULL
main*  3 files  Δ+10 −1  ↑2 ↓1

NORMAL
main*  Δ+10 −1

COMPACT
main*

MICRO
git*
```

Do not label `Δ+10 −1` as “Codex changed” because other processes/users may also have changed the worktree.

Git collection is demand-driven:

- branch only requested → do not calculate diff stats
- diff stats requested → calculate them
- ahead/behind not displayed → do not calculate it
- Git not selected anywhere → Git collector does not run

---

# 14. Live tabs

Available Live views:

```text
Overview
Performance
Processes
Tools
Resources
Usage
```

Default visible tabs:

```text
Overview
Tools
Resources
```

Optional/power-user tabs:

```text
Performance
Processes
Usage
```

Users choose visible tabs in `codexm --configure`.

Enabled does not mean continuously collected. Heavy collectors start only when their data is actually required.

---

# 15. Live — Overview

Overview is the default view and gives current-run essentials.

Possible sections, depending on user configuration:

```text
CONTEXT
USAGE
SESSION
ACTIVITY
SYSTEM SUMMARY
```

Typical lightweight default information:

```text
Activity
Requested model
Reasoning
Project
Context used / left
Input / cached / output / reasoning
Turns
Elapsed
Last turn duration
Compactions
Session health
Freshness
Login quota if current run reports it
```

Heavy System metrics are **not required by the default lightweight profile**. If user enables CPU/RAM/System metrics, their collectors are activated by demand.

---

# 16. Live — Performance

Optional power-user view.

May show current-run, in-memory only:

```text
Codex CPU
Codex RAM
Monitor CPU
Monitor RAM
system CPU/RAM
short token activity
short tool activity
sparklines
```

Rules:

- samples are held in bounded in-memory ring buffers
- no persistent performance history
- collector starts only when view/metric is active
- leaving the view stops continuous sampling when no other visible metric requires it
- charts begin from the time sampling begins; no fake past data

---

# 17. Live — Processes

Optional power-user view.

Possible normalized table/tree:

```text
PID
PPID
name
command
CPU
RAM
age
hot process
```

Example:

```text
codex
 └─ shell
     └─ npm
         └─ node
```

Process collection is platform-specific underneath but normalized before UI rendering.

If Processes is not being viewed and no other selected metric needs process-tree data, the collector must stop.

---

# 18. Live — Tools

Strictly **current run only**.

Do not load old tool history.

Possible aggregate:

```text
All
Bash
Read
Edit
Grep
MCP
...
```

Current-run event feed:

```text
21:42:03 Read  src/render.js
21:42:08 Grep  "CollectorPlan"
21:42:14 Edit  src/state.js
21:42:20 Bash  npm test
21:42:31 MCP   github: search_code
```

The tool view can show:

```text
tool counts
current tool
last tool
timestamp
turn
sanitized detail
tool errors
```

Only data with reliable current-run evidence is shown.

---

# 19. Live — Resources

Resources is an inventory/effective-environment inspector, not a file viewer.

Sub-views:

```text
Instructions
Skills
MCP
Rules
Permissions
```

## Skills

Prefer structured Codex metadata.

Show metadata such as:

```text
name
short description
scope
enabled/effective
source/path
dependencies/tool requirements
usage count this run if proven
last used if proven
```

Internal scope semantics stay faithful to Codex:

```text
user
repo
system
admin
```

UI labels may be:

```text
Global
Project
System
Admin
```

Do not render the full `SKILL.md`.

## Instructions / AGENTS

Do not display body content.

Show metadata only:

```text
scope
path
precedence/effective chain
size
line count
modified time
optional first heading/title
effective state if reliably determinable
```

## MCP

Show inventory/status, not raw config:

```text
server
scope
transport
configured / active / error
tool count if known
calls this run
last used
sanitized command/endpoint
```

Never show tokens/API keys/passwords/secret environment values.

## Rules

Show metadata only:

```text
file/source
scope
rule count if safely parseable
modified
effective state
```

No full rule body.

## Permissions

Show current Codex permissions when available:

```text
sandbox
approval policy
network restriction
permission source
```

Resources collectors are lazy. If Resources is not used, no Skills/MCP/AGENTS/Rules scan should happen.

---

# 20. Live — Usage

Optional detailed usage view.

May contain:

```text
Context
Input
Cached input
Uncached input if derivable correctly
Output
Reasoning
Turn I/O
Compactions
Login 5H / Week quota
Requested/Actual model with strict provenance
Freshness
```

Usage is still current-run only.

---

# 21. Activity state

Priority:

```text
ERROR > APPROVAL > TOOL > THINKING > IDLE
```

Canonical symbols:

```text
● IDLE
● THINKING
◆ TOOL
! APPROVAL
× ERROR
```

Use transient PTY evidence plus durable rollout/session evidence.

Derived state must not override stronger official/durable evidence incorrectly.

---

# 22. Session Health

Session Health is a **derived UI state**, not official Codex telemetry.

Possible values:

```text
WAITING
OK
LONG
HIGH
PRESSURE
```

Inputs may include:

- context pressure
- turns since compact
- compaction history
- session age

Exact thresholds can be tuned after real-world testing.

---

# 23. Freshness

Every telemetry source should conceptually expose freshness:

```text
waiting
current
stale
```

Stale data must not silently look current.

---

# 24. F4 History

The only globally frozen special Live hotkey is:

```text
F4 = History
```

When pressed:

```text
current Codex continues running
        │
        └── platform.openHistoryTerminal()
                 │
                 └── codexm --history
```

Preferred behavior:

- open a new terminal tab/window
- focus/select the currently running Codex session in History
- never disturb the active Codex PTY

If the current terminal cannot be opened programmatically:

```text
Could not open a new terminal.
Run: codexm --history
```

The failure must not affect Codex.

Exact keyboard fallback for switching Live tabs is not a global product hotkey yet; mouse/tab-navigation implementation should avoid consuming ordinary prompt characters.

---

# 25. Live visual design

Live Monitor preserves the current semantic color language.

Suggested semantic palette:

```text
green    healthy / idle / success
gold     thinking / warning
blue     tools
orange   approval / moderate pressure
red      error / critical pressure
cyan     information / navigation
purple   reasoning / special secondary metric
gray     inactive/frame
```

Themes:

```text
Color
Mono
Matrix
```

`Color` is the default and may use a restrained cyberpunk-inspired dark/neon treatment.

`Matrix` is a stronger green terminal aesthetic.

`Mono` is the fallback/low-capability/accessibility treatment.

Background setting:

```text
Terminal / no override
Black
Dark
Custom RGB
```

Do not change the entire terminal application background via OSC in v1.

---

# 26. Responsive renderer

Layout is based on terminal width **and height**.

Section metadata concept:

```text
minWidth
preferredWidth
maxWidth
estimatedHeight
priority
stretchWeight
```

Section types:

```text
REGULAR
SMALL
INLINE
```

Metric representations:

```text
FULL
COMPACT
MICRO
```

Fallback order:

```text
full
→ compact
→ micro
→ truncate
→ hide optional
→ minimal layout
```

No word-wrap for telemetry rows.

Use terminal-cell width (`wcwidth` equivalent) for:

- ANSI-stripped text
- Vietnamese
- Unicode
- symbols
- emoji/flags

If flag rendering is unreliable, use:

```text
VI | EN
```

Resize behavior:

- debounce approximately 50–100 ms
- recompute layout only when dimensions/capabilities change
- resize PTY/scroll region correctly
- atomic repaint
- use hysteresis to prevent layout flicker

---

# 27. Demand-driven collection

Config + active UI become a runtime demand graph.

```text
config
  +
header selection
  +
enabled tabs
  +
active tab
  +
enabled metrics
        │
        ▼
   DEMAND GRAPH
        │
        ▼
 COLLECTOR PLAN
```

Example:

```text
HEADER
Activity
Model
Project
Git

TABS
Overview
Tools
Resources

ACTIVE
Overview
```

Possible plan:

```text
PTY                    ON
current rollout        ON
activity parser        ON
model parser           ON
Git branch/dirty       ON

tool-detail aggregate  OFF until Tools needs it
Skills                 OFF until Resources needs it
MCP                    OFF until Resources needs it
process tree           OFF
performance sampler    OFF
project size           OFF
disk collector         OFF
```

Collector demand goes down to **individual metrics**, not merely whole tabs.

---

# 28. Central scheduler

Avoid a large collection of independent `setInterval()` loops.

Use one scheduler/collector manager that knows:

```text
is this collector demanded?
when did it last run?
what is its TTL?
how expensive was the last run?
is its data stale?
is the active view waiting for it?
```

Priority:

```text
1. PTY input/output
2. terminal correctness / resize
3. Codex lifecycle
4. current-run rollout state
5. visible UI state
6. optional telemetry
7. cosmetic/background work
```

Codex interaction always wins over Monitor telemetry.

---

# 29. Event-driven first

Prefer events/incremental reads wherever possible:

```text
PTY output           event-driven
keyboard             event-driven
terminal resize      event-driven
process exit         event-driven
rollout JSONL        tail/incremental
```

Polling only for data that truly needs it:

```text
CPU/RAM
process tree
Git
disk
project size
```

Polling cadence should adapt to cost and demand.

If a collector becomes expensive, back off.

---

# 30. Render only changes

Do not redraw at a fixed FPS.

Pipeline:

```text
state changes
   ↓
mark dirty fields/rows
   ↓
render scheduler
   ↓
build new frame
   ↓
diff previous/new
   ↓
single batched ANSI write
```

If nothing changed:

```text
0 repaint
```

Avoid animation that exists only for decoration.

No fake 30/60 FPS cyberpunk effects.

Visual movement should come from real state updates.

---

# 31. History Viewer definition

Command:

```powershell
codexm --history
```

Behavior:

- does not launch Codex
- opens a full-screen alternate-buffer TUI
- reads official Codex local session JSONL
- can view finished sessions
- can live-tail a session that is currently growing
- no network
- no history database
- no telemetry recording service

Primary source conceptually:

```text
~/.codex/sessions/**/*.jsonl
```

History Viewer is logically separate from Live Monitor.

---

# 32. History ownership/storage rule

Codex owns the session history.

Monitor does not duplicate it.

```text
Official Codex
      │
      └── ~/.codex/sessions/**/*.jsonl
                │
                ├── codexm live reads current run
                └── codexm --history reads local history
```

v1 does **not** create:

```text
history.sqlite
history.csv
history database
telemetry archive
CPU/RAM history database
```

History index/cache in v1 is RAM-only.

A small disposable disk index may only be considered later if benchmarking proves session discovery too slow.

---

# 33. History visual direction

History is intentionally more visually expressive than Live.

Target style:

> **Cyberpunk / hacker / futuristic terminal dashboard**

Characteristics:

- dark background
- neon cyan navigation
- green live/healthy
- gold/orange pressure
- red errors/critical context
- purple reasoning/secondary signal
- dense technical panels
- terminal-native charts
- status bars
- sparklines
- subtle dynamic behavior from real data

It must still remain:

- readable
- responsive
- low CPU
- terminal-native
- keyboard-accessible
- local-only

No fake continuous animation.

A live History screen should look “alive” because the current session file is receiving real events.

---

# 34. History terminal capability fallbacks

Preferred capabilities:

```text
alternate screen buffer
ANSI cursor positioning
24-bit true color
Unicode block characters
Braille plotting
mouse reporting
partial repaint
```

Capability degradation:

```text
TRUECOLOR
   ↓
256 COLOR
   ↓
16 COLOR
   ↓
MONO
```

Charts:

```text
Braille
  ↓
Unicode blocks
  ↓
ASCII
```

Data semantics remain identical across representations.

---

# 35. History main dashboard

High-level layout:

```text
CODEXM HISTORY                                      LOCAL ONLY · ● LIVE
┌─────────────────────────────────────────────────────────────────────────┐
│                   OVERVIEW / LIVE ANALYTICS STRIP                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                           SESSIONS TABLE                                │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                         SELECTED SESSION                                │
├─────────────────────────────────────────────────────────────────────────┤
│ Info | Tokens | Turns | Tools | Resources | Errors | Storage           │
└─────────────────────────────────────────────────────────────────────────┘
```

The exact number and physical placement of panels is responsive. This is a layout direction, not a fixed 5-column contract.

---

# 36. History — Sessions table

The initial History view shows sessions as soon as enough lightweight metadata is available.

Example columns:

```text
STATE
LAST
DURATION
PROJECT
SESSION
MODEL
CONTEXT
INPUT
CACHE
OUTPUT
REASONING
TURNS
TOOLS
SIZE
```

Responsive terminals may hide lower-priority columns.

Example:

```text
STATE   LAST   DUR     PROJECT      MODEL      CONTEXT  INPUT   CACHE   OUT   RSN   TURN  TOOLS
● LIVE  now    43m     Monitor-Cli  gpt-...      72%   1.82M   1.61M   94K   21K     18     74
○       3h     21m     Backend      gpt-...      48%    612K    501K   32K    8K      9     31
○       1d     2h17m   Project-A    gpt-...      81%   4.21M   3.78M  184K   52K     47    188
```

Supported interactions should include:

```text
sort
filter
search
select session
open session detail
```

Useful sort/filter dimensions:

```text
age
project
model
duration
context
tokens
tools
errors
size
```

For a growing current session, only the appended JSONL segment is read from the last known offset.

---

# 37. History session detail tabs

A selected session has:

```text
Info
Tokens
Turns
Tools
Resources
Errors
```

`Storage` is a History-level management view and can also be reachable from the tab/navigation strip.

For a currently growing session, detail fields update from new JSONL data.

For a completed session, the same UI becomes a static snapshot.

---

# 38. History — Info

Show factual session metadata when available:

```text
Session ID
Project
CWD
Start
End
Duration
State LIVE/ENDED
Requested model
Actual/effective model only if proven
Reasoning
Turns
Compactions
Tool calls
Retries
Errors
Git metadata only if actually persisted/evidenced
```

No current filesystem scan is allowed to fabricate old session metadata.

---

# 39. History — Tokens

Token Summary should be the most detailed historical analytics view.

Possible fields:

```text
Input total
Cached input
Uncached input if correctly derivable
Cache ratio
Output
Reasoning output
Total
Current/last context
Peak context if reconstructable
Context window
Compactions
```

Missing values remain `--`.

No pricing/cost estimates.

---

# 40. History — Turns

Detailed per-turn table when source data allows:

```text
TURN
TIME
DURATION
INPUT
CACHE
OUTPUT
REASONING
CONTEXT
TOOLS
COMPACTION MARKER
ERROR/RETRY MARKER
```

Example:

```text
TURN  TIME   DUR    INPUT  CACHE  OUT   RSN  CONTEXT  TOOLS
14    22:18  18.2s  108K   92K   7.1K  2.4K   61%      4
15    22:21  42.7s  116K   99K   9.8K  3.1K   68%      7
16    22:24  11.4s  121K  106K   4.2K  1.8K   74%      2
17    22:27  51.8s  127K  111K  11.3K  4.4K   81%      8
18    22:31  16.1s   74K   64K   5.6K  2.1K   43%      3
```

Only calculate duration when timestamps/events make it reliable.

---

# 41. History — Tools

Historical Tool Activity belongs here, not in Live.

Show aggregate counts and event details for the selected session.

Aggregate example:

```text
TOOL      CALLS
Read         24
Bash         18
Edit         12
Grep          9
MCP           7
...
```

Event feed example:

```text
TIME      TURN  TOOL  DETAIL
22:31:02   18   Read  src/render.js
22:31:04   18   Grep  "CollectorPlan"
22:31:09   18   Edit  src/state.js
22:31:13   18   Bash  npm test
22:31:28   18   MCP   github: search_code
```

Details must be sanitized and only shown where the session source actually contains reliable evidence.

---

# 42. History — Resources

Historical Resources must be evidence-based.

Possible rows:

```text
TYPE   NAME        CALLS / EVIDENCE
Skill  pdfs        3
Skill  slides      1
MCP    github      12
MCP    filesystem  7
```

Do not scan today’s Skills/MCP/AGENTS configuration and claim it was active in an old session.

If historical evidence is insufficient:

```text
No reliable resource usage recorded for this session.
```

---

# 43. History — Errors

Show session timeline/table for:

```text
errors
retries
stream failures
tool failures
compaction events
```

Example:

```text
TIME      TURN  TYPE        DETAIL
22:04:18    7   Retry       stream retry
22:17:42   13   Tool error  Bash exit 1
22:17:51   13   Retry       tool retried
22:29:04   17   Compaction  context compacted
```

---

# 44. History realtime charts

v1 chart set is intentionally limited to useful session-native data.

## 1. Context over turns/time

Primary chart.

Shows context pressure growth and compaction drops.

```text
100% │
 80% │                         ╭──╮
 60% │                 ╭───────╯  ╰─╮
 40% │        ╭────────╯            ╰────
 20% │────────╯
     └────────────────────────────────────
       1   3   5   7   9   11  13  15  18
                              ↑ compact
```

## 2. Token I/O per turn

Series/bars for:

```text
Input
Cached
Output
Reasoning
```

## 3. Cumulative tokens

Tracks session token accumulation across turns/time.

## 4. Turn duration

Shows completed turn durations.

A new bar/point is added when a turn completes.

## 5. Tool calls per turn/time

Shows tool activity density.

May filter by tool type using already-parsed data.

## Event timeline

Not necessarily a conventional chart; show markers for:

```text
retry
error
compaction
```

Example:

```text
01────03────05────07────09────11────13────15────17────18
                   R                       ×R              C
```

Realtime rule:

> Charts update only when new source data arrives or the user changes the view.

No cosmetic animation loop.

---

# 45. What History does NOT collect

History deliberately does not become a second System Monitor.

Do not add these to History v1:

```text
historical CPU
historical RAM
historical process tree
live process tree
ports
system-wide process telemetry
project filesystem state fabricated after the session
```

CPU/RAM/Processes belong to Live Monitor.

This keeps History lightweight and reconstructable from Codex session data.

---

# 46. History — Storage

Storage is the only History area that manages Codex session files.

Show:

```text
session count
total history size
oldest session
newest session
history path
per-session file size
largest sessions
optional size by project / age
```

Example:

```text
HISTORY STORAGE

Sessions          428
Total size        1.84 GB
Oldest            214 days
Path              ~/.codex/sessions
```

Storage analysis runs only inside `codexm --history`.

Live `codexm` must not scan all history to calculate its size.

---

# 47. History deletion workflow

There is **no automatic retention**.

No:

```text
auto delete after 30 days
auto delete after 90 days
background cleanup
startup cleanup
```

Deletion is explicit selection.

Example:

```text
[ ] session A   84 MB
[x] session B   61 MB
[x] session C   47 MB
[ ] session D   31 MB

Selected: 2 sessions · 108 MB
```

Controls:

```text
Space  Toggle selection
A      Select all visible
N      Select none
I      Invert visible selection
D      Delete selected
```

`Select all` means:

> Select all currently visible/filtered eligible sessions.

It must not silently select filtered-out sessions.

The currently active LIVE session is not deletable:

```text
[─] ● LIVE current session
```

Deletion confirmation:

```text
DELETE SELECTED HISTORY

37 Codex sessions
624 MB

These Codex session files will be permanently removed
from the local Codex sessions directory.

Cancel / Delete
```

History is read-only except this explicit, user-confirmed delete operation.

Monitor does not create backups of deleted Codex sessions.

---

# 48. History parsing/performance

Opening History must not deep-parse thousands of sessions before showing UI.

Preferred startup:

```text
discover files
    ↓
stat size/mtime
    ↓
show UI quickly
    ↓
parse visible rows first
    ↓
parse more lazily/on demand
```

Deep session parsing happens when the selected session/detail tab needs it.

Growing files:

```text
remember last offset
→ stat size/mtime
→ read appended bytes only
→ update normalized session state
```

Closing History discards its RAM index/cache.

---

# 49. History mouse/keyboard behavior

Mouse support is desirable where terminal mouse reporting is available:

- click tabs
- click/select rows
- scroll lists/charts

Mouse is never the only interaction method.

Keyboard equivalents must exist for essential actions such as:

```text
selection
navigation
search
filter
back
quit
delete confirmation
```

Normal text keys must not be globally stolen from the active Codex prompt by Live Monitor.

---

# 50. Configuration / onboarding

First-run language choice:

```text
🇻🇳 Tiếng Việt
🇺🇸 English
```

Fallback:

```text
VI | EN
```

Interactive configuration:

```text
codexm --configure
```

Flow:

```text
Language
↓
Preset
↓
Sections / Metrics
↓
Live Tabs
↓
Header
↓
Theme
↓
Preview
↓
Save
```

Header selection:

```text
Select up to 4
```

Live tab selection is independent from header status selection.

---

# 51. Presets

Shared data semantics:

```text
Recommended
Compact
Full
Custom
```

## Recommended

Default.

Focus on useful current-run metrics with minimal overhead.

Heavy System/Process collectors should not be forced on by default.

## Compact

Legacy “Lite” idea.

Same semantics, fewer metrics, shorter representations, lowest visual/collector workload.

## Full

Makes nearly all supported metrics/views available.

It does **not** mean every heavy collector polls continuously.

## Custom

User chooses exact:

```text
sections
metrics
header items
tabs
theme
```

User does not manually manage columns or widths.

The layout engine remains responsible for physical presentation.

---

# 52. Config model

Directional schema:

```json
{
  "configVersion": 1,
  "language": "vi",
  "preset": "recommended",
  "theme": "color",
  "background": "terminal",
  "layout": "auto",
  "sections": {
    "context": true,
    "usage": true,
    "session": true,
    "activity": true,
    "system": false
  },
  "header": [
    "activity",
    "model",
    "reasoning",
    "project"
  ],
  "tabs": [
    "overview",
    "tools",
    "resources"
  ],
  "updateCheck": true
}
```

Config is versioned and migratable.

Exact platform-native config path may be finalized during packaging, but must be discoverable through:

```text
codexm --config-path
```

No secrets should be stored in Monitor config.

---

# 53. Local persistence owned by Monitor

Monitor persistent storage is limited to its own product state.

Conceptually:

```text
codex-monitor/
├── config.json
└── update-state.json
```

Possible future disposable cache must be rebuildable and non-authoritative.

Monitor does not own a session history database.

---

# 54. Network policy

Hard rule:

> **Normal monitoring and History are fully local/offline.**

Forbidden:

```text
remote quota lookup
pricing lookup
provider metadata lookup
telemetry upload
analytics
crash upload
prompt upload
token/activity upload
project metadata upload
Git remote fetch for monitoring
extra model/API call
```

The only allowed automatic network behavior:

```text
GitHub Releases update check
maximum approximately once per 24 hours
```

Explicit user actions may also use the update network path:

```text
codexm --check-update
codexm --update
```

Users may disable automatic update checks.

The update request must not include:

- prompts
- Codex activity
- tokens
- project path/content
- API endpoint/key
- machine stats
- Git state

---

# 55. Update subsystem

GitHub Releases is the source of truth for Monitor updates.

Normal startup flow:

```text
start codexm
    ↓
read local update-state
    ↓
last check < 24h?
    ├── yes → no network
    └── no  → launch Codex normally
              + non-blocking release check
```

Update failure never blocks Codex.

Notification:

```text
↑ Codex Monitor v1.2.0 available · run codexm --update
```

Do not place update notices inside the Live HUD/pane once the Codex TUI is settled.

Default:

```text
auto check     ON
auto install   OFF
```

Stable releases only for v1.

---

# 56. Security/privacy

Must never log/display:

```text
API keys
access tokens
passwords
secret environment values
raw auth headers
```

Sanitize diagnostic output.

Treat PTY/rollout content as data, never executable monitor instructions.

Sanitize control characters/ANSI before using data inside Monitor UI fields.

Do not unnecessarily copy prompts/session content into Monitor-owned storage.

Supply-chain/update path is a major security boundary.

Public releases should eventually use:

```text
CI tests
package
code signing where applicable
timestamp
verification
SHA256
GitHub Release
```

---

# 57. Terminal crash safety

P0 correctness requirement.

Monitor must restore terminal state on:

```text
normal exit
Codex exit
signals
uncaught exceptions
PTY failure
resize failure
Monitor crash where recovery is possible
```

Restore:

```text
scroll region
cursor visibility
mouse mode
alternate screen state when used
raw mode
terminal attributes
```

Codex Monitor must not leave the user's terminal corrupted.

---

# 58. Renderer implementation guidance

Prefer a lightweight custom ANSI renderer rather than introducing a heavyweight reactive TUI framework merely for terminal panels.

Pipeline:

```text
Normalized State
    ↓
ViewModel
    ↓
Responsive Layout
    ↓
Frame
    ↓
Frame diff
    ↓
batched ANSI output
```

Renderer must never:

```text
scan project
run Git
enumerate process tree
read npm cache
walk Skills/AGENTS
perform network I/O
perform heavy filesystem work
```

---

# 59. Suggested collector cadence philosophy

Cadences are adaptive, not absolute contracts.

Typical order of magnitude:

```text
PTY                      event-driven
rollout JSONL             event/incremental tail
HUD/view repaint          state-driven, capped when busy
Monitor CPU/RAM           ~1s when demanded
system CPU/RAM            ~1–2s when demanded
Codex process tree        ~2–5s when active
Git                       ~5–10s / trigger when demanded
disk                      ~10–30s when demanded
project size              ~30–60s when demanded
package/cache metrics     minutes/on-demand if ever supported
```

If a collector is expensive, scheduler backs off.

---

# 60. Live vs History ownership matrix

| Feature | Live `codexm` | History `codexm --history` |
|---|---:|---:|
| Official Codex launched | Yes | No |
| Current-run Activity | Yes | Can observe persisted events of live session |
| Current context/tokens | Yes | Yes for selected session |
| Historical sessions | No | Yes |
| Current-run Tools | Yes | Yes for selected historical/live session |
| Skills/MCP current environment | Yes, lazy | Only historical usage if evidenced |
| CPU/RAM | Optional live | No |
| Process tree | Optional live | No |
| Performance sparklines | Optional live RAM | No |
| Historical token charts | No | Yes |
| Turn analytics | Current summary | Yes |
| Storage size | No | Yes |
| Delete sessions | No | Yes, explicit selected deletion |
| History database | No | No |
| Network monitoring | No | No |
| F4 History | Yes | N/A |

---

# 61. Product UX summary

## Live

```text
codexm
```

Designed to answer:

> What is Codex doing **right now**?

Core concepts:

```text
current run
low overhead
same terminal
header + tabs
responsive
demand-driven collectors
F4 History
```

## History

```text
codexm --history
```

Designed to answer:

> What happened in this Codex session, how did context/tokens/tools evolve, and how much local session storage exists?

Core concepts:

```text
local JSONL
read-only by default
deep session analytics
live-tail current session
cyberpunk full-screen TUI
manual selected deletion
no DB
no system telemetry
```

---

# 62. Implementation phases

## Phase A — correctness first

- current-run hard reset
- no historical merge into Live
- auth isolation
- Login/API quota isolation
- strict Actual Model provenance
- freshness
- reliable rollout tail
- PTY safety
- terminal restore

## Phase B — demand/performance foundation

- normalized state
- Demand Graph
- Collector Plan
- central scheduler
- per-metric dependencies
- lazy collectors
- diff renderer
- bounded buffers
- adaptive backoff

## Phase C — cross-platform layer

- Windows adapter
- Linux adapter
- macOS adapter
- PTY abstraction
- process/system abstraction
- terminal launcher abstraction

## Phase D — Live UI

- two-region header
- max four status slots
- configurable tabs
- Overview
- Tools
- Resources
- optional Usage
- optional Performance
- optional Processes
- responsive representations
- themes
- F4 History

## Phase E — History core

- session discovery
- lightweight metadata index in RAM
- incremental/live-tail parser
- Sessions table
- selected session detail
- Tokens / Turns / Tools / Resources / Errors

## Phase F — History cyberpunk UI

- alternate screen
- neon semantic theme
- terminal capability detection
- Braille/block/ASCII chart fallback
- five realtime/historical charts
- event timeline
- responsive dashboard
- mouse support + keyboard fallback

## Phase G — Storage management

- total size
- per-session size
- selection
- select all visible
- invert/none
- LIVE session protection
- delete confirmation

## Phase H — productization

- configure/onboarding
- config migration
- doctor/diagnostics/repair
- update cache/check/install
- uninstall
- documentation
- signing/release pipeline
- compatibility testing

---

# 63. Release acceptance checklist

A release should not be considered ready unless:

## Data correctness

- [ ] New run starts with unknown telemetry as `--`
- [ ] No previous session fills current-run values
- [ ] Login quota never appears in API mode
- [ ] Actual Model is never guessed
- [ ] `0` and `--` remain semantically different
- [ ] stale data is visibly stale/waiting

## Performance

- [ ] Hidden metrics do not collect
- [ ] inactive heavy views do not continuously poll
- [ ] unchanged screen does not repaint
- [ ] renderer does no heavy I/O
- [ ] collector buffers are bounded
- [ ] PTY always has priority over telemetry
- [ ] idle Monitor CPU/I/O remains very low

## UI

- [ ] no telemetry word-wrap
- [ ] no border overflow
- [ ] resize is stable
- [ ] Unicode cell width is correct
- [ ] header navigation survives narrow widths
- [ ] colors degrade gracefully
- [ ] terminal state restores correctly

## Cross-platform

- [ ] Windows tested
- [ ] Linux tested
- [ ] macOS tested
- [ ] OS-specific code isolated in adapter
- [ ] unsupported platform feature degrades safely

## History

- [ ] History does not launch Codex
- [ ] no SQLite/history DB
- [ ] old sessions are lazy-parsed
- [ ] growing session is incremental-tailed
- [ ] no CPU/RAM/process telemetry in History
- [ ] historical Resources are evidence-based
- [ ] LIVE session cannot be deleted
- [ ] Select All means visible eligible rows
- [ ] deletion always requires explicit confirmation

## Network/privacy

- [ ] no telemetry
- [ ] no quota API
- [ ] no pricing API
- [ ] no extra model/API calls
- [ ] no secret leakage in diagnostics
- [ ] automatic network limited to update check cadence
- [ ] update failure never blocks Codex

---

# 64. Final product rules

The entire v1 can be summarized by these rules:

> **Live only knows the current run.**

> **History reads Codex-owned local sessions; Monitor does not create a second history store.**

> **Monitoring is local-only; the updater is the only automatic network exception.**

> **What is not displayed is not collected.**

> **What is not being viewed is not continuously polled.**

> **What has not changed is not repainted.**

> **Windows, Linux, and macOS share the same product/UI/data semantics; only platform adapters differ.**

> **History may look futuristic and dynamic, but movement must come from real session data, not expensive decorative animation.**

---

# 65. Frozen v1 scope snapshot

```text
Codex Monitor v1
│
├── Live Monitor
│   ├── official Codex wrapper
│   ├── current-run-only state
│   ├── max-4 status header
│   ├── configurable right-side tabs
│   ├── Overview
│   ├── Tools
│   ├── Resources
│   ├── optional Usage
│   ├── optional Performance
│   ├── optional Processes
│   ├── demand-driven collectors
│   ├── responsive ANSI diff renderer
│   └── F4 History
│
├── History Viewer
│   ├── full-screen cyberpunk TUI
│   ├── Sessions
│   ├── Info
│   ├── Tokens
│   ├── Turns
│   ├── Tools
│   ├── Resources
│   ├── Errors
│   ├── Storage
│   ├── Context chart
│   ├── Token I/O chart
│   ├── Cumulative token chart
│   ├── Turn duration chart
│   ├── Tool calls chart
│   ├── retry/error/compaction timeline
│   ├── live-tail current session
│   └── select / select-all-visible / delete
│
├── Product Management
│   ├── configure
│   ├── reset
│   ├── config/config-path
│   ├── doctor
│   ├── diagnostics
│   ├── repair
│   ├── update
│   └── uninstall
│
└── Infrastructure
    ├── Windows adapter
    ├── Linux adapter
    ├── macOS adapter
    ├── local-only runtime
    ├── GitHub update check ≤ ~24h
    └── signing/release pipeline
```

---

**End of frozen v1 backup.**

Future changes should be written as explicit amendments to this document rather than silently changing old semantics.
