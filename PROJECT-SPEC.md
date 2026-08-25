# Codex Monitor — PROJECT_SPEC

**Version:** 1.0 implementation baseline  
**Frozen:** 2026-08-25  
**Status:** Product/architecture freeze for implementation  
**Scope:** Codex Monitor v1  

> This document is the current source of truth for the Codex Monitor project. New chats and implementation work should follow this specification unless a later written decision explicitly supersedes it.

---

## 1. Product definition

Codex Monitor is a lightweight local wrapper and session-management tool around the **official Codex CLI**.

The product has two main runtime modes:

```text
CODEX MONITOR
│
├── LIVE MONITOR
│   └── codexm [codex args...]
│       ├── launches official Codex
│       ├── passive display only
│       ├── current run only
│       └── never owns navigation input
│
└── SESSION MANAGER
    └── codexm --manager
        ├── does not launch Codex
        ├── full interactive TUI
        ├── sees all local Codex sessions
        ├── supports multiple concurrent LIVE sessions
        ├── analyzes ended sessions
        └── manages session storage explicitly
```

Core product rules:

1. **Official Codex is never forked, modified, or rebuilt.**
2. **Live Monitor is passive.** It does not intercept function keys, arrows, letters, or navigation shortcuts for Monitor UI.
3. **Live is current-run only.** Previous sessions must never fill missing current-run telemetry.
4. **Session Manager is separate.** It owns all interactive navigation, charts, filters, selection, and session-management UI.
5. **No extra model/API calls for monitoring.**
6. **Normal monitoring is local-only.** Network is reserved for the update subsystem only.
7. **What is not displayed is not collected. What is not actively viewed is not continuously polled. What has not changed is not repainted.**
8. **Same product, same semantics, same UI model on Windows/Linux/macOS.** OS-specific work stays behind platform adapters.

---

# 2. Product boundaries

## 2.1 Live Monitor

`codexm` is a wrapper around official Codex.

```powershell
codexm
codexm resume
codexm -m <model>
codexm --preset compact resume
```

Monitor options are consumed by Codex Monitor. Unknown/non-Monitor arguments are forwarded unchanged to official Codex.

Escape hatch:

```powershell
codexm -- --help
```

Everything after `--` is passed directly to official Codex.

### Live Monitor is display-only

Live Monitor must not contain:

- interactive tabs;
- Inspector mode;
- F2/F4 navigation;
- mouse navigation;
- arrow-key Monitor navigation;
- shortcut interception that competes with Codex input.

The keyboard path should conceptually remain:

```text
User keyboard ───────────────────────────────→ Official Codex
                                                    ↑
Monitor observes PTY/session signals ───────────────┘
```

The Monitor is a guest in the terminal. Codex interaction always has higher priority than telemetry.

---

## 2.2 Session Manager

Canonical command:

```powershell
codexm --manager
```

There is **no separate public `--history` feature in v1**. Historical sessions are simply ended sessions inside Session Manager.

Session Manager:

- does **not** launch Codex;
- reads Codex-owned local session data;
- displays ended sessions;
- can detect and follow one or many currently growing sessions;
- can inspect one selected session in depth;
- is the only interactive analytics/dashboard TUI;
- is the only place where session storage can be explicitly deleted by the user.

Example multi-session use case:

```text
Terminal 1: codexm              → Project A
Terminal 2: codexm              → Project B
Terminal 3: codexm              → Project C
Terminal 4: codexm --manager    → sees A/B/C as LIVE
```

Session Manager may also show sessions launched using plain official `codex` when local evidence is sufficient.

---

# 3. Data ownership and persistence

## 3.1 Codex owns session history

Codex Monitor does not create a second history database.

Primary historical source:

```text
~/.codex/sessions/**/*.jsonl
```

Architecture:

```text
Official Codex
   └── local session/rollout JSONL
          ├── Live Monitor reads current-run data
          └── Session Manager reads/tails all relevant sessions
```

## 3.2 No Monitor history database in v1

Do not introduce by default:

- SQLite history database;
- CSV history storage;
- duplicated transcript archive;
- automatic retention database;
- background telemetry recorder.

Session Manager may build **RAM-only indexes/caches** while open.

A small disposable disk index is allowed only later if benchmarking proves session discovery too slow. It must be rebuildable and never become the source of truth.

## 3.3 Monitor-owned persistent files

Monitor may persist its own configuration/update metadata only, conceptually:

```text
.codex-monitor/
├── config.json
└── update-state.json
```

Exact OS-specific path is not frozen yet.

These files may contain:

- language;
- preset;
- theme;
- enabled sections/metrics;
- header selections;
- auto update-check preference;
- other Monitor UI preferences;
- last update-check metadata.

They must not contain API keys, access tokens, prompts, session transcripts, or machine telemetry.

---

# 4. Hard current-run rule

At every new Live Monitor process start, runtime/session telemetry must be hard reset.

Reset at startup:

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

Meaning:

```text
0   = source explicitly reported zero
--  = no valid current-run value yet
```

Never use previous session values to replace `--`.

Login quotas also start at `--` until the **current run** provides valid quota data.

API mode must never inherit Login quota.

---

# 5. Normalized state architecture

Use one normalized state model, not separate Lite/Full data paths.

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
└── freshness
```

The same source semantics feed all representations.

Pipeline:

```text
Official Codex CLI
      │
      ├── PTY live output
      ├── rollout/session JSONL
      ├── auth/config/runtime signals
      └── local process/runtime signals
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
              ▼
        RESPONSIVE LAYOUT
              │
              ▼
        ANSI DIFF RENDERER
```

Renderer must not perform heavy I/O, project scans, Git commands, process-tree scans, package scans, or session discovery itself.

---

# 6. Official / local / derived data

Every metric must have clear provenance.

## Official / Codex-derived source data

Examples:

- model/requested model;
- reasoning setting;
- token usage;
- context/window;
- session/thread IDs;
- rate-limit/quota values when present in the current run;
- tool/activity events;
- permissions/approval-related values;
- compaction events;
- retry/error events.

## Local machine data

Examples:

- Git working tree;
- local process/system usage;
- disk free;
- project size;
- Monitor resource use.

## Derived UI state

Examples:

- context percentage;
- cache ratio;
- turns since compact;
- Session Health;
- formatted durations;
- hot process;
- aggregate live-session counts in Manager.

Derived values must never be presented as official server telemetry.

---

# 7. Auth model

Primary command:

```powershell
codexm
```

Auth detection order:

1. explicit Monitor `--auth` override;
2. suitable API-key environment configuration;
3. official Codex auth/status/stored-auth signals;
4. launch official Codex;
5. verify again when current session appears.

Supported conceptual modes:

```text
login
api
other/unknown
```

Override examples:

```powershell
codexm --auth api
codexm --auth login
```

`--auth` is a Monitor hint/override and must not rewrite official Codex credentials.

---

# 8. Model rules

## Requested model

Show when current configuration/source clearly reports it.

## Actual/server model

Never assume:

```text
ACTUAL = REQUESTED
```

If reliable evidence is absent:

```text
ACTUAL --
```

If a trustworthy source later exposes server/effective model, requested and actual may be shown separately.

Third-party API gateways must not be treated as proof of provider/effective model.

---

# 9. Cost/pricing rule

Codex Monitor v1 does **not** maintain pricing tables and does **not** calculate cost as token × model price.

Do not add:

- LiteLLM pricing downloads;
- OpenAI/Anthropic pricing fetches;
- bundled pricing databases requiring maintenance;
- `$ / hour` or `$ / day` estimates created by Monitor.

If Codex/provider data itself supplies a trustworthy cost estimate, it may be displayed conditionally with explicit provenance.

---

# 10. Network policy

Normal Live Monitor and Session Manager operation must be local/offline.

Forbidden for monitoring:

- remote quota lookup;
- pricing API lookup;
- provider metadata lookup;
- extra model/API calls;
- telemetry upload;
- analytics upload;
- crash-report upload;
- prompt/session upload;
- machine telemetry upload.

The only automatic network operation permitted is the updater's GitHub Releases check.

Target policy:

```text
Automatic update check: at most ~once per 24 hours
Auto install: OFF
Normal Monitor operation: zero network
```

Explicit network commands:

```powershell
codexm --check-update
codexm --update
```

The update request must never send Codex prompts, token activity, project data, API endpoint/key, Git data, or system telemetry.

---

# 11. Live Monitor UI

## 11.1 Role

Live Monitor is a **small passive HUD** attached to the official Codex terminal.

It must remain readable, responsive, and non-interactive.

No Manager navigation belongs in Live.

## 11.2 Product presets

Canonical presets:

```text
Recommended
Compact
Full
Custom
```

They share identical data semantics.

- **Recommended:** balanced default.
- **Compact:** fewer metrics and shorter representations; lowest default workload.
- **Full:** exposes nearly all useful enabled Live metrics but is still demand-driven.
- **Custom:** user chooses exactly which sections/metrics/header items are enabled.

## 11.3 Main Live sections

```text
CONTEXT
USAGE
SESSION
ACTIVITY
SYSTEM
```

### CONTEXT

Potential metrics:

- context used %;
- used/window;
- left %;
- compactions;
- last/since compact;
- turns since compact;
- Session Health;
- cache metrics when available/selected.

### USAGE

Login mode may show:

- 5-hour quota;
- weekly quota;
- input;
- cached input;
- output;
- reasoning;
- turn I/O.

API mode may show:

- requested model;
- actual model only with evidence;
- input;
- cached input;
- output;
- reasoning;
- turn I/O.

API mode must not show Login 5h/week quota as if valid.

### SESSION

Potential metrics:

- elapsed;
- turns;
- last turn duration;
- update age;
- session/thread ID;
- Codex version;
- Monitor version;
- freshness.

### ACTIVITY

Priority:

```text
ERROR > APPROVAL > TOOL > THINKING > IDLE
```

Suggested symbols:

```text
● IDLE
● THINKING
◆ TOOL
! APPROVAL
× ERROR
```

Potential details:

- current tool/command;
- last tool;
- task progress;
- permissions;
- approval;
- retry/error.

### SYSTEM

Optional only. Potential metrics:

- system CPU/RAM;
- Codex process-tree CPU/RAM;
- Monitor CPU/RAM;
- process count;
- hot process;
- project size;
- disk free.

These collectors must never run merely because the code exists. They run only when selected/demanded.

---

# 12. Live header

Live header is status-only, never navigation.

User may select a small number of important header items. Recommended maximum: **4 items**.

Possible choices:

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

Recommended default:

```text
Activity | Model | Reasoning | Project
```

Header is not a second dashboard. Detailed telemetry belongs in the body.

## Git representation

Git is one header item with responsive representations.

Potential full form:

```text
main*  3 files  Δ+10 −1  ↑2 ↓1
```

Semantics:

- `main` = current branch;
- `*` = dirty working tree;
- `Δ+10 −1` = working-tree lines added/deleted vs HEAD;
- `↑2 ↓1` = commits ahead/behind remote when explicitly selected and available.

Never claim `Δ+/-` means changes made by Codex specifically.

Responsive forms:

```text
FULL     main*  3 files  Δ+10 −1  ↑2 ↓1
NORMAL   main*  Δ+10 −1
COMPACT  main*
MICRO    git*
```

Git collection is metric-demand-driven. If only branch/dirty are displayed, do not calculate line deltas or remote ahead/behind.

---

# 13. Responsive Live renderer

Responsive behavior is based on terminal **cell width and height**, not physical aspect ratio.

Rules:

- Section is a component/card; physical column is a layout lane.
- A lane may contain several small sections.
- Do not map one section directly to one fixed column.
- No telemetry word wrapping.
- Use `FULL`, `COMPACT`, and `MICRO` representations.
- If still too large: truncate, hide optional values, then use minimal fallback.
- Use Unicode display-cell width (`wcwidth` equivalent).
- Resize should recompute layout only, debounce approximately 50–100 ms, and repaint atomically.
- Use hysteresis to prevent layout flicker around width thresholds.

---

# 14. Themes and color semantics

Themes:

```text
Color
Mono
Matrix / Cyber
```

Background options for HUD/TUI only:

```text
Terminal / no override
Black
Dark
Custom RGB
```

Do not modify the whole terminal background via OSC in v1.

Preserve current semantic color language:

```text
Green     healthy / idle / success
Gold      thinking / warning
Blue      tool activity
Orange    approval / pressure
Red       error / critical pressure
Cyan      information / navigation / chrome
Purple    reasoning / special analytics
Muted     secondary/inactive text
```

Session Manager may visually lean strongly into a cyberpunk/hacker-futuristic style, but colors must remain semantically meaningful.

---

# 15. Configure flow

Command:

```powershell
codexm --configure
```

Flow:

```text
Language
↓
Preset
↓
Sections
↓
Metrics
↓
Header
↓
Theme
↓
Preview
↓
Save
```

There is no Live Tabs configuration in v1 because Live Monitor has no interactive tabs.

Language:

```text
Tiếng Việt
English
```

Flags/emoji may be used when display is reliable; fallback to `VI | EN`.

---

# 16. Session Manager — purpose

Session Manager is the interactive local command center for Codex sessions.

Command:

```powershell
codexm --manager
```

It supports:

- multiple concurrent LIVE Codex sessions;
- ended/historical sessions;
- realtime lightweight tracking of all visible LIVE sessions;
- deep inspection of one selected session;
- token/context/turn/tool analytics;
- session resource evidence;
- retry/error/compaction timeline;
- storage analysis;
- explicit select/delete of ended sessions.

It must not become a generic machine/system process manager in v1.

Do not add to Manager v1 merely for visual effect:

- generic CPU history;
- generic RAM history;
- process explorer;
- ports;
- network traffic;
- GPU/temperature;
- arbitrary filesystem artifacts;
- pricing/cost panels.

---

# 17. Session Manager visual direction

Session Manager should look like a futuristic local operations console:

- dark terminal background;
- cyan/green/purple/gold semantic highlights;
- restrained neon borders;
- generous spacing;
- large useful charts;
- few high-value panels rather than dense metric walls;
- data-driven movement instead of constant fake animation.

Design rule:

```text
Cyberpunk comes from typography, color, geometry, charts, and live data — not from high-FPS decorative animation.
```

The UI should feel alive because real session data changes.

---

# 18. Manager top-level dashboard

The default Manager screen should answer within a few seconds:

- how many Codex sessions are currently LIVE;
- which session is under the most context pressure;
- whether token/tool activity is currently high;
- which sessions have recent problems;
- what local sessions exist and how large they are.

## Recommended global dashboard panels

Keep the dashboard open and breathable. Do not pack every metric into cards.

Recommended summary panels/data:

### A. Live Sessions

```text
Active sessions
Aggregate turns
Aggregate tool calls
Longest-running live session
```

### B. Token Activity

Aggregate **LIVE sessions only**.

Possible values:

```text
Input
Cached input
Cache ratio
Output
Reasoning
```

Primary visualization: live sparkline/time series.

### C. Context Pressure

Compare current context pressure across LIVE sessions.

Example:

```text
Backend       ████████████████── 82%
Monitor-Cli   ████████████────── 68%
Website       █████───────────── 24%
```

This is one of the most useful multi-session visualizations.

### D. Live Activity

Show reliable recent activity per LIVE session, for example:

```text
Monitor-Cli   updated now
Backend       updated 2s
Website       updated 8s
```

If reliable last-tool evidence exists:

```text
Monitor-Cli   Edit   now
Backend       Bash   2s
Website       Read   8s
```

Do not invent state beyond available evidence.

### E. Session Events

Summaries such as:

```text
Errors
Retries
Compactions
Latest significant event
```

### F. Storage summary

```text
Session count
Total history size
Oldest session
Largest session
```

Storage computation must be cached/lazy and not trigger repeated file reads.

---

# 19. Manager dashboard charts

Charts are important visual elements, but density is deliberately limited.

## Global dashboard — default chart set

Freeze the default at approximately **3 primary charts**:

1. **Token Activity**
2. **Context Pressure**
3. **Tool Activity**

Do not add charts merely because space is available.

Rule:

```text
Manager Dashboard  → max ~3 primary charts
Session Overview   → max ~1 large hero chart
Analytics tab      → max ~2 charts visible together
```

When terminal width grows, prefer making existing charts wider rather than adding more panels.

---

# 20. Global chart definitions

## 20.1 Token Activity

Visualizes real activity for LIVE sessions.

Example terminal representation:

```text
IN    ▁▂▃▄▆▇█▆▅▇
OUT   ▁▁▂▃▂▄▃▅▂▄
```

Optional additional series only if readable:

```text
CACHE
RSN
```

The chart updates only when underlying data changes.

## 20.2 Context Pressure

Bar chart across LIVE sessions.

Semantic thresholds are visual/derived and may evolve; exact health thresholds are not frozen.

## 20.3 Tool Activity

Histogram/sparkline of tool activity over recent turns/time.

Example:

```text
8 │              ▆
6 │     ▅        █
4 │ ▃   █  ▃  ▆  █ ▄
2 │ █ ▂ █  █  █  █ █
  └──────────────────→
```

May show compact counts by tool type alongside the chart.

---

# 21. Manager session list

Main table should support:

```text
All
Live
Ended
Search
Filter
Sort
Select ended sessions
```

Example columns:

```text
STATE
PROJECT
MODEL
DURATION
CONTEXT
INPUT
CACHE
TURN
TOOLS
SIZE
```

Example:

```text
STATE   PROJECT       MODEL      DUR    CTX    INPUT   CACHE   TURN   TOOLS   SIZE
● LIVE  Monitor-Cli   gpt-5.6    42m    68%    1.82M    88%     18      74    18M
● LIVE  Backend       gpt-5.6    17m    82%     628K    81%      9      29    11M
● LIVE  Website       gpt-5.6     6m    24%     184K    76%      4      12     4M
○       Old-Test      gpt-5.4    38m    72%     901K    84%     14      63    47M
```

The Manager may use keyboard and mouse because it is independent from Codex input.

Possible controls:

```text
↑/↓          move selection
Enter        inspect session
←/→ or Tab   move detail tabs
/            search
F            filter
Space        toggle selection in storage/delete contexts
Q / Esc      back/quit as context allows
```

Exact keymap can be finalized during implementation, because there is no Codex-input collision in Manager mode.

---

# 22. Detecting LIVE sessions

Do not define LIVE using file modification time alone.

Use a `SessionActivityResolver` with the strongest local evidence available, potentially combining:

```text
Codex process existence
session JSONL growth
session metadata
cwd/session ID/process mapping
```

If evidence is strong:

```text
● LIVE
```

If clearly ended:

```text
○ ENDED
```

If uncertain, do not confidently claim LIVE. An intermediate recent/unknown state may be used if useful.

This follows the same strict-evidence philosophy as Actual Model.

---

# 23. Multi-session performance model

Manager must not deep-parse every LIVE session continuously.

At the global list/dashboard level:

```text
Each LIVE session → lightweight incremental tail/state update
```

Only collect enough for visible global data such as:

```text
live/ended state
elapsed
context
tokens
turn count
tool count
last activity
recent errors/compactions
```

When the user selects one session:

```text
Selected session
     ↓
Deep parser / detail aggregation ON
     ↓
Charts + turns + tools + resources + errors
```

Leaving that session releases/sleeps detail-only work.

Rule:

> Not viewing deeply → do not process deeply.

---

# 24. Session detail views

Selecting one session opens:

```text
Info | Tokens | Turns | Tools | Resources | Errors
```

The same UI works for LIVE and ENDED sessions.

```text
LIVE  → incremental tail updates
ENDED → static/read-only data
```

## 24.1 Info

Show high-value session facts:

```text
State
Project
CWD
Session ID
Start/end
Elapsed/duration
Requested model
Actual model if evidence
Reasoning
Turns
Compactions
Tool calls
Retries
Errors
Input
Cached input
Output
Reasoning tokens
```

Primary hero visualization:

### Context Timeline / Context Stream

This is the **signature visualization** of Session Manager.

Example:

```text
100% ┤
 80% ┤                            ╭──────╮
 60% ┤                 ╭──────────╯      │
 40% ┤       ╭─────────╯                 ╰────╮
 20% ┤───────╯                              ╰──
     └──────────────────────────────────────────→
       T1       T5       T10       T15       T18
                                      ▲ compact
```

Compaction markers should be visible when reliable events exist.

## 24.2 Tokens

Detailed summary when supported by JSONL:

```text
Input total
Cached input
Uncached input
Cache ratio
Output
Reasoning output
Total
Context current
Context peak
Compactions
```

Do not manufacture unsupported values.

Charts:

1. **Token I/O per turn**
2. **Cumulative Tokens**

Example Token I/O representation:

```text
Turn 14   Input   ███████████████  108K
          Cache   █████████████     92K
          Output  ██                7.1K
          Rsn     █                 2.4K
```

## 24.3 Turns

Table when data permits:

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
```

Chart:

### Turn Duration

Updates when a new turn completes for LIVE sessions.

## 24.4 Tools

Aggregate table:

```text
TOOL
CALLS
%
```

Event list:

```text
TIME
TURN
TOOL
DETAIL
```

Example:

```text
22:31:02  18  Read   src/render.js
22:31:04  18  Grep   CollectorPlan
22:31:09  18  Edit   src/state.js
22:31:13  18  Bash   npm test
22:31:28  18  MCP    github: search_code
```

Chart:

### Tool Calls per Turn / Time

The event stream itself is also an important dynamic visual element.

## 24.5 Resources

Resources is an evidence-based inventory, not a file viewer.

Only show historical/session resource claims that the session data actually proves.

Potential rows:

```text
Skills used
MCP servers/tools used
Instructions/rules if reliably attributable
```

Do not scan today's filesystem and claim those resources existed in an old session.

For current/live environments, structured metadata may include:

### Skills

```text
name
description
scope
enabled/effective state
path/source
dependencies
calls this run / last used when reliable
```

Friendly scope mapping:

```text
user   → Global
repo   → Project
system → System
admin  → Admin
```

Do not render the full `SKILL.md` body.

### Instructions / AGENTS

Show metadata only:

```text
scope
path
precedence/effective chain
size
line count
modified time
optional first heading
```

Do not display the full body.

### MCP

Show sanitized inventory:

```text
server name
scope
transport
configured/active/error
tool count
calls this run
last used
sanitized command/endpoint
```

Never display API keys, auth tokens, passwords, or raw secret environment values.

### Rules / Permissions

Show summaries such as:

```text
sandbox
approval policy
network restriction
rule files/sources
rule counts if safely available
effective source
```

## 24.6 Errors

Show timeline of:

```text
Retries
Errors
Tool failures
Stream failures
Compactions
```

Example:

```text
TIME       TURN   TYPE          DETAIL
22:04:18      7   Retry         stream retry
22:17:42     13   Tool error    Bash exit 1
22:17:51     13   Retry         tool retried
22:29:04     17   Compaction    context compacted
```

Optional lightweight event timeline:

```text
01────03────05────07────09────11────13────15────17────18
                   R                       ×R              C
```

---

# 25. Session Manager realtime behavior

For LIVE sessions, realtime updates may include:

```text
Tokens
Context
Turns
Tool calls
Errors/retries
Compactions
Elapsed time
Model/session metadata when the source changes
```

Session Manager should tail appended JSONL incrementally using file offset/size tracking.

Do not repeatedly re-read the entire file.

Realtime does **not** mean fake animation or fixed frame rate.

```text
New data → update affected state → repaint affected rows/chart
No change → no repaint
```

---

# 26. Cyber/animation policy

Allowed visual movement:

- token sparklines changing with data;
- context timeline extending with new data;
- tool histogram updating with events;
- new tool events appending;
- elapsed time updating at a low cadence;
- optional subtle LIVE pulse in Cyber theme.

Avoid:

- high-FPS decorative animation;
- constant spinners for stable states;
- repainting unchanged dashboards;
- expensive glow/blurring effects impossible in terminal anyway.

Terminal techniques may include:

```text
ANSI cursor positioning
alternate screen buffer
24-bit color
256/16-color fallback
Unicode block characters
Braille charts
mouse tracking in Manager only
partial screen repaint
```

Fallback hierarchy:

```text
TRUECOLOR → 256 COLOR → 16 COLOR → MONO
Braille   → Block chars → ASCII
```

Data semantics must remain identical across representations.

---

# 27. Session storage management

Session Manager owns the storage-management UI for Codex session files.

Default behavior is read-only.

No automatic deletion.

No 30/90/180-day retention policy.

No background cleanup.

Storage summary may show:

```text
Sessions
Total size
Oldest session
Newest session
Largest sessions
Size by project
Size by age
```

Expensive breakdowns should be computed only when Storage is opened or requested.

## Selection model

```text
Space   toggle current row
A       select all visible/filtered ended sessions
N       select none
I       invert visible selection
D       delete selected
```

`Select All` means **all currently visible/filtered eligible sessions**, not hidden rows.

LIVE sessions are not eligible for deletion:

```text
[─] ● LIVE  current-session
```

Footer should always show selection impact:

```text
Selected: 37 sessions · 624 MB
```

## Delete confirmation

Deletion must clearly say that underlying Codex session files are being removed.

Example:

```text
DELETE SELECTED SESSIONS

37 Codex sessions
624 MB

These session files will be permanently removed
from ~/.codex/sessions.

Cancel / Delete
```

Deletion is the only intentional write operation against Codex session history in v1.

---

# 28. Performance architecture

Performance is a product requirement, not an optimization phase.

Four hard rules:

> **What you don't display, we don't collect.**

> **What you're not viewing, we don't continuously poll.**

> **What hasn't changed, we don't repaint.**

> **OS-specific behavior stays behind a Platform Adapter.**

## 28.1 Demand graph

Configuration and active UI create data demand:

```text
User Config
   │
   ├── enabled sections
   ├── enabled metrics
   ├── header selections
   ├── Manager active screen
   └── Manager selected session/tab
          │
          ▼
      DEMAND GRAPH
          │
          ▼
   COLLECTOR MANAGER
```

Do not start optional collectors with no consumer.

## 28.2 Metric-level demand

Demand must be granular.

Example:

```text
Git branch/dirty selected
→ branch + dirty collector only

Git Δ+/- selected
→ add diff-stat work

Git ahead/behind selected
→ add remote-tracking comparison work
```

Do not enable every Git operation just because the Git header item exists.

## 28.3 Active-view demand

Heavy Manager work should run only while its view/session requires it.

Example:

```text
Global session list
→ lightweight session tails

Select Session B / Tokens
→ deep token aggregation for Session B ON

Leave Session B
→ detail-only processing sleeps/releases
```

## 28.4 Central scheduler

Avoid many independent `setInterval` loops.

Use one scheduler that understands:

```text
collector demand
priority
TTL/cadence
last run
last duration
staleness
backoff
```

Priority concept:

```text
1. PTY input/output
2. terminal correctness / resize
3. Codex lifecycle
4. current-run rollout/session state
5. visible UI state
6. optional telemetry
7. cosmetic/background work
```

Optional telemetry must never make Codex interaction lag.

## 28.5 Event-driven first

Prefer event/incremental processing for:

```text
PTY output
terminal resize
process exit
rollout/session append
keyboard/mouse in Manager
```

Poll only when necessary.

## 28.6 Adaptive backoff

If an optional collector becomes expensive, automatically reduce its cadence.

Concept:

```text
normal      2s
expensive   4s
still slow  8s
```

Recover gradually when cheap again.

## 28.7 Render on change

No fixed global FPS loop.

```text
State change
   ↓
mark dirty
   ↓
render debounce/rate limit
   ↓
compute affected frame
   ↓
ANSI diff
   ↓
one/batched stdout write
```

Idle Monitor should approach sleeping behavior.

## 28.8 Diff rendering

Compare previous/new terminal frames and repaint only changed rows/cells where practical.

Batch ANSI output to minimize ConPTY/terminal overhead.

## 28.9 Bounded buffers

All live charts use bounded RAM ring buffers.

Do not append samples forever.

Do not persist performance/chart telemetry to disk by default.

---

# 29. Suggested collector cadences

These are starting points, not fixed guarantees:

```text
PTY                         event-driven
rollout/session tail        event-driven/incremental when possible
HUD/Manager repaint         on change, rate-limited
Monitor CPU/RAM             ~1s only if displayed
system CPU/RAM              ~1–2s only if displayed
Codex process tree          ~2–5s only if displayed
Git basic                   ~5–10s or trigger-based
Disk                        ~10–30s only if displayed
Project size                ~30–60s only if displayed
Package cache               minutes/on-demand only
```

The collector scheduler may back off automatically.

---

# 30. Cross-platform architecture

Supported design target:

```text
Windows
Linux
macOS
```

The user-facing product should behave the same.

Only OS integration differs.

```text
                    CODEX MONITOR CORE
                           │
           state / parser / scheduler / UI
                           │
                  PLATFORM INTERFACE
                 ┌─────────┼─────────┐
                 ▼         ▼         ▼
              Windows    Linux     macOS
```

Suggested source organization:

```text
src/
├── core/
├── collectors/
├── live/
├── manager/
├── ui/
└── platform/
    ├── index.js
    ├── windows.js
    ├── linux.js
    └── macos.js
```

Avoid `if (process.platform...)` scattered throughout business logic.

Potential platform differences:

```text
PTY implementation
process/system APIs
process-tree implementation
signals/terminal restore
filesystem/config paths
installer/updater details
```

Normalized results should share common structures, e.g.:

```text
ProcessInfo {
  pid
  ppid
  name
  command
  cpuPercent
  memoryBytes
  startedAt
}
```

Exact process-tree implementation remains an implementation/benchmark decision.

---

# 31. Freshness

Normalized state should explicitly understand freshness:

```text
waiting
current
stale
```

Stale data must not silently masquerade as current data.

This applies especially to:

- quota;
- session activity;
- model metadata;
- optional local telemetry;
- Manager session tails.

---

# 32. Session Health

Session Health is a derived UX state, not official Codex telemetry.

Possible states:

```text
WAITING
OK
LONG
HIGH
PRESSURE
```

It should rely mainly on context pressure, optionally informed by:

- turns since compact;
- compact history;
- session age.

Exact thresholds are deliberately not frozen in v1 spec.

---

# 33. CLI contract

Canonical form:

```text
codexm [monitor options] [codex arguments]
```

## Run / wrapper

```powershell
codexm
codexm [codex arguments...]
```

## Session Manager

```powershell
codexm --manager
```

No public `--history` command in the current v1 contract.

## Configuration

```powershell
codexm --configure
codexm --reset
codexm --preset <recommended|compact|full|custom>
codexm --theme <color|mono|matrix>
codexm --lang <vi|en>
codexm --auth <auto|api|login>
```

## Diagnostics / maintenance

```powershell
codexm --doctor
codexm --diagnostics
codexm --repair
```

## Information

```powershell
codexm --config
codexm --config-path
codexm --monitor-version
```

## Update

```powershell
codexm --check-update
codexm --update
```

## Removal

```powershell
codexm --uninstall
```

## Help / pass-through

Monitor owns:

```powershell
codexm -h
codexm --help
```

To guarantee official Codex receives `--help`:

```powershell
codexm -- --help
```

Prefer official Codex ownership of normal `--version`; use `--monitor-version` for Monitor version.

---

# 34. Reset / repair / diagnostics / uninstall semantics

## `--reset`

Reset Monitor settings and rerun onboarding/configuration.

Must not delete:

- official Codex;
- Codex auth;
- Codex session/history files.

## `--repair`

May repair:

- runtime/shim installation;
- PTY/runtime prerequisites;
- config migration;
- broken Monitor-owned files.

Must not rewrite Codex session history.

## `--diagnostics`

Produce a sanitized report.

Never include:

- API keys;
- access tokens;
- passwords;
- prompts/transcripts;
- unredacted secret env values.

## `--uninstall`

Remove only Codex Monitor components.

Never remove:

- official Codex CLI;
- official Codex auth;
- `~/.codex/sessions`;
- Codex-owned history.

Default behavior may keep Monitor config/cache unless user explicitly chooses removal.

---

# 35. Update subsystem

GitHub Releases is the source of truth for Monitor releases.

Normal startup flow:

```text
codexm start
   ↓
read current version + last check
   ↓
if < 24h → skip network
if >=24h → launch Codex normally + non-blocking release check
   ↓
cache latest metadata
```

Update checks must never block Codex startup.

If a background check completes after the Codex TUI is settled, cache the result and notify on a later safe startup instead of corrupting the terminal.

Suggested notification:

```text
↑ Codex Monitor v1.2.0 available · run codexm --update
```

Use informational colors, not error red.

Auto-check default: ON.  
Auto-install default: OFF.  
Stable releases only initially.

Possible future advanced flag:

```text
--no-update-check
```

---

# 36. Security and privacy

Key security principle: Monitor has a relatively small runtime attack surface; distribution/update supply chain is a larger concern.

Requirements:

- never log API keys/access tokens;
- never upload telemetry;
- do not copy prompts/transcripts unnecessarily;
- treat PTY/JSONL content as data, never executable commands;
- sanitize ANSI/control sequences where data enters Manager rendering;
- config/cache contain no secrets;
- diagnostics redact sensitive values;
- updater verifies release integrity;
- public Windows installer/binary should use code signing + timestamp when feasible;
- release pipeline should produce SHA256 hashes.

Recommended CI release flow:

```text
tests
→ package
→ sign
→ timestamp
→ verify
→ SHA256
→ GitHub Release
```

---

# 37. History/session deletion safety

Because Session Manager may delete Codex-owned session files, deletion UX must be explicit and conservative.

Rules:

1. Default Manager operation is read-only.
2. No auto cleanup.
3. No retention policy.
4. LIVE sessions cannot be selected for deletion.
5. `Select All` only selects eligible visible/filtered sessions.
6. Always show selected session count and reclaimable size.
7. Always show a confirmation before deletion.
8. Confirmation must identify that Codex session files are being permanently removed.

---

# 38. What is intentionally not in v1

The following are deliberately out of scope unless a later written decision adds them:

- Live Monitor interactive tabs;
- Live Monitor function-key navigation;
- F2/F4 Monitor shortcuts;
- separate `--history` mode;
- Monitor-owned history database;
- historical CPU/RAM/process telemetry;
- generic process manager inside Session Manager;
- ports/network/GPU/temperature dashboard;
- automatic session retention/cleanup;
- pricing/cost calculation;
- remote quota APIs;
- remote analytics/telemetry;
- extra model calls for summaries;
- session transcript duplication;
- session deletion from Live Monitor;
- free-form user header template language.

---

# 39. Implementation phases

## Phase A — Data correctness

Priority P0:

- enforce hard current-run reset;
- remove stale previous-session quota merges;
- isolate API vs Login quota;
- strict Actual Model evidence;
- normalized state + freshness;
- reliable current session discovery;
- incremental JSONL tailing;
- preserve terminal restore/crash safety.

## Phase B — Demand-driven core

- Demand Graph;
- Collector Manager;
- central scheduler;
- metric-level dependencies;
- event-driven updates;
- adaptive collector backoff;
- bounded buffers.

## Phase C — Live UI foundation

- passive HUD only;
- presets;
- header max-item policy;
- responsive lane layout;
- Unicode cell width;
- ANSI diff renderer;
- themes;
- configuration migration/versioning.

## Phase D — Session Manager core

- discover all local sessions;
- classify LIVE/ENDED with evidence;
- lightweight tracking of multiple LIVE sessions;
- global session list/search/filter/sort;
- selected-session deep parser;
- storage accounting;
- safe deletion flow.

## Phase E — Session analytics UI

- cyber/futuristic TUI chrome;
- global Token Activity chart;
- global Context Pressure chart;
- global Tool Activity chart;
- selected-session Context Timeline hero chart;
- Token I/O chart;
- Cumulative Tokens chart;
- Turn Duration chart;
- Tool Calls chart;
- error/compaction event timeline;
- truecolor/256/16/mono fallbacks;
- Braille/block/ASCII chart fallbacks.

## Phase F — Cross-platform/productization

- Windows/Linux/macOS platform adapters;
- installer/repair/uninstaller;
- update subsystem;
- signing/release pipeline;
- compatibility testing;
- README/SECURITY/PRIVACY/CHANGELOG documentation.

---

# 40. Release checklist

Before calling v1 production-ready, verify:

### Data correctness

- [ ] No previous-session telemetry leaks into Live.
- [ ] `0` vs `--` semantics are correct.
- [ ] Login quota starts `--` until current-run evidence exists.
- [ ] API never inherits Login quota.
- [ ] Actual Model is never guessed.
- [ ] Freshness/stale states are explicit.

### Live Monitor

- [ ] No Monitor navigation/input interception.
- [ ] Official Codex input works unchanged.
- [ ] Layout never word-wraps telemetry unexpectedly.
- [ ] Borders do not overflow terminal cells.
- [ ] Resize works without corrupting Codex UI.
- [ ] Unicode/Vietnamese display width is correct.
- [ ] Compact mode is genuinely lightweight.

### Performance

- [ ] Disabled metric → collector does not run.
- [ ] Heavy inactive view → continuous collector does not run.
- [ ] Unchanged screen → no unnecessary repaint.
- [ ] No unbounded in-memory chart buffers.
- [ ] Optional telemetry backs off when expensive.
- [ ] Codex PTY responsiveness remains priority #1.
- [ ] Idle CPU/I/O is low on weak hardware.

### Session Manager

- [ ] Multiple concurrent LIVE sessions can be tracked.
- [ ] Global tracking is lightweight.
- [ ] Only selected session is deeply parsed.
- [ ] LIVE/ENDED classification is evidence-based.
- [ ] Charts update from real data, not fake animation.
- [ ] Ended sessions render using the same detail semantics.
- [ ] Historical resources are never inferred from today's filesystem.

### Storage safety

- [ ] No automatic delete.
- [ ] LIVE sessions cannot be deleted.
- [ ] Select All only applies to visible eligible sessions.
- [ ] Selected count/size is shown before delete.
- [ ] Delete confirmation explicitly mentions Codex session files.

### Network/privacy

- [ ] No monitoring network requests.
- [ ] No telemetry upload.
- [ ] Update check is cached and non-blocking.
- [ ] Automatic release check happens at most about once per 24h.
- [ ] Diagnostics contain no secrets.

### Cross-platform

- [ ] Same data semantics on Windows/Linux/macOS.
- [ ] OS logic stays behind adapters.
- [ ] terminal capability fallback works.
- [ ] terminal restore works on normal exit and crash/signal paths.

---

# 41. Canonical architecture summary

```text
                               CODEX MONITOR
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                     │
                 ▼                                     ▼
          LIVE MONITOR                           SESSION MANAGER
             codexm                              codexm --manager
                 │                                     │
       Official Codex + HUD                    Independent full TUI
                 │                                     │
         current run only                       all local sessions
         passive display                       LIVE + ENDED sessions
         no navigation                         multi-session dashboard
         no hotkeys                            charts / search / filter
                                                select / delete ended
                 │                                     │
                 └──────────────────┬──────────────────┘
                                    ▼
                            LOCAL CODEX SOURCES
                       PTY / JSONL / config / runtime
                                    │
                                    ▼
                             NORMALIZED STATE
                                    │
                         demand-driven processing
                                    │
                                    ▼
                            RESPONSIVE ANSI UI

NETWORK:
GitHub Releases updater only, cached ≤ ~once/24h automatically.
```

---

# 42. Product laws

These statements should be treated as architectural review rules:

> **Live Monitor only observes the current run.**

> **Live Monitor never owns navigation input.**

> **Session Manager owns interactive analytics and session management.**

> **Codex owns history; Monitor reads and presents it.**

> **Multiple LIVE Codex sessions may be monitored concurrently by Manager.**

> **What you don't display, we don't collect.**

> **What you're not viewing, we don't continuously poll.**

> **What hasn't changed, we don't repaint.**

> **Monitoring is local-only; updater is the only automatic network exception.**

> **Do not guess official telemetry. Unknown means `--`.**

> **Same product and semantics across Windows, Linux, and macOS; platform differences stay underneath adapters.**

---

# 43. Future Claude CLI reuse

After Codex Monitor is stable, the reusable architecture may be adapted for Claude CLI:

Reusable concepts:

- passive Live Monitor principle;
- Session Manager concept;
- demand graph / collector scheduler;
- normalized state architecture;
- responsive renderer;
- ANSI diff rendering;
- cyber analytics UI;
- freshness/provenance rules;
- cross-platform adapters;
- local-only network policy;
- updater/product-management commands.

Claude-specific collectors and semantics must be implemented separately. Do not assume Codex event/token/quota/resource semantics are identical to Claude.

---

# 44. Change-control rule

This file is the implementation baseline.

When a future decision changes product semantics, do one of the following:

1. update this document and increment its version/date; or
2. record an explicit decision/amendment under `docs/decisions/` and mark which section it supersedes.

Do not silently change major behavior only in code or chat.

Suggested repository placement:

```text
docs/PROJECT_SPEC.md
```

