# Codex Monitor — PROJECT-SPEC

**Version:** 1.1 implementation baseline  
**Updated:** 2026-08-26  
**Status:** Phase 06 closed; Phase 07 closed development checkpoint; Phase 08 next  
**Scope:** Codex Monitor v1

> This file is the current product/architecture source of truth. The numbered files in `docs/RoadMap/` define execution details for each phase.

---

## 1. Product shape

Codex Monitor wraps the official OpenAI Codex CLI without forking or modifying it.

```text
CODEX MONITOR
├── LIVE MONITOR
│   └── codexm [monitor options] [codex args...]
│       ├── launches official Codex
│       ├── passive HUD only
│       ├── binds telemetry to the exact new/resumed session
│       └── never owns Codex navigation/input
└── SESSION MANAGER
    └── codexm --manager
        ├── independent interactive TUI
        ├── reads local LIVE + ENDED sessions
        └── owns analytics and session storage management
```

Product laws:

1. Official Codex owns stdin after spawn.
2. Live Monitor never adds navigation hotkeys, tabs, mouse navigation, or input interception.
3. Unrelated previous sessions must never fill missing current-session telemetry.
4. Exact resume may hydrate durable state from the exact resumed rollout only; transient state starts clean.
5. No extra model/API calls are made for monitoring.
6. Normal monitoring is local-only. The updater is the only automatic network exception.
7. What is not demanded should not be collected; what has not changed should not be repainted unnecessarily.
8. Windows/Linux/macOS share product semantics; OS differences stay behind Platform Adapters.

---

## 2. Live CLI contract

Examples:

```powershell
codexm
codexm resume
codexm resume --last
codexm resume <thread-id>
codexm -m <model>
codexm --preset compact resume
```

Monitor-owned options are consumed by Codex Monitor. Unknown arguments are forwarded to official Codex.

```powershell
codexm -- --help
```

Everything after `--` is passed through unchanged.

There is no Monitor-owned public `--history` mode in v1. `--history` is forwarded to official Codex.

---

## 3. Data ownership and resume

Codex owns session history:

```text
~/.codex/sessions/**/*.jsonl
```

Codex Monitor does not maintain a second transcript/history database by default.

### New session

```text
0   = source explicitly reported zero
--  = no valid value for this bound session yet
```

### Resume

Bare `codexm resume` uses the Monitor local picker before spawn, resolves the exact local rollout/thread ID, hydrates durable telemetry from that exact rollout, then launches official Codex resume.

Transient state must not hydrate from history:

- approval pending;
- active tools;
- active error;
- currently executing command/turn unless proven current.

### Login quota exception

5H/WEEK quota is account-scoped. Login mode may bootstrap quota from the newest valid local Codex JSONL evidence.

- local files only;
- no quota network request;
- API mode never inherits Login quota;
- current-run quota evidence supersedes bootstrap evidence.

---

## 4. Normalized state and provenance

One normalized state feeds every representation:

```text
NormalizedMonitorState
├── auth
├── model
├── context
├── usage
├── quota
├── session
├── activity
├── tools
├── compaction
├── git
├── system
├── performance
├── processes
├── resources
└── freshness
```

Every metric must retain provenance/freshness. Derived values must never be presented as official Codex telemetry.

Renderer code must not perform heavy I/O, Git commands, session discovery, process scans, or network access.

---

## 5. Auth

Conceptual modes:

```text
login
api
other/unknown
```

Detection priority:

1. explicit Monitor `--auth` override;
2. suitable API-key environment configuration;
3. official Codex login-status/stored-auth evidence;
4. current-session evidence when available.

An explicit override may force the Codex login method for that launch, but Monitor must not rewrite stored Codex credentials.

---

## 6. MODEL and ROUTED

`MODEL` is the model Codex persists/applies for the current turn/thread, primarily from modern `turn_context` or `thread_settings_applied` evidence.

Direct API normally shows only:

```text
MODEL  gpt-...
```

`ROUTED` appears only when explicit routing evidence exists, currently including Codex `model_reroute`.

```text
MODEL   codex-main
ROUTED  azure/gpt-5.6
```

No evidence means the ROUTED row is omitted. Never display `ACTUAL waiting...` and never infer `ROUTED = MODEL`.

Future LiteLLM/gateway support may populate ROUTED only from trustworthy routing/deployment telemetry. An alias or response model field alone is not enough when the proxy can internally route/fallback.

The internal legacy slot `model.actual` may remain temporarily, but its UI/product meaning is routed-model evidence.

---

## 7. Live presets and cards

Public presets:

```text
compact
recommended
full
custom
```

`minimal` is not a preset; it is an internal responsive representation.

Card order:

1. CONTEXT
2. USAGE
3. SESSION
4. CURRENT ACTIVITY
5. SYSTEM when present
6. BEAST MODE when present

Representation ladder:

```text
rich → normal → compact → minimal
```

Responsive decisions use terminal cells/rows, not physical screen size.

---

## 8. CONTEXT / USAGE / SESSION / ACTIVITY

### CONTEXT

Current important values include context used %, used/window, left %, cache-related value where useful, compaction count, and turns since compact.

Derived context severity:

```text
<60%    healthy
60–79%  warning
80–89%  high
>=90%   critical
```

### USAGE — Login

May show 5H/WEEK quota plus input/cache/output/reasoning and turn I/O.

### USAGE — API

May show MODEL, ROUTED only with evidence, input/cache/output/reasoning and turn I/O. API mode never shows Login quota as valid telemetry.

### SESSION

Includes elapsed, turns, last-turn duration, update age, exact thread/session ID, freshness/bound state, and resume evidence where applicable.

### CURRENT ACTIVITY

Priority is fixed:

```text
ERROR > APPROVAL > TOOL > THINKING > IDLE
```

`THINKING`/`IDLE` are normalized derived states. Approval may require conservative PTY fallback because upstream rollout traces do not always persist the live approval request.

---

## 9. SYSTEM

SYSTEM currently means whole-machine telemetry, not Codex-process telemetry.

```text
SYSTEM
CPU   16%  <history sparkline>
RAM   35%  <history sparkline>
USED  <short capacity bar> 11.8 GB/34.1 GB
```

Rules:

- CPU/RAM history uses a bounded in-memory sample ring;
- wide cards resample existing history across available width instead of stopping at a fixed 36-cell cap;
- RAM capacity bar stays short;
- no redundant FREE row;
- do not mix Codex process CPU/RAM into this card.

Future workspace/disk/Codex-home sizing is backlog, not part of closed Phase 06.

---

## 10. SYSTEM and BEAST display modes

Both use:

```text
off
auto
on
```

Meaning:

```text
off   = card does not exist
auto  = may use spare horizontal capacity but must not create another grid row by itself
on    = explicitly selected; may reflow onto additional rows
```

AUTO priority favors SYSTEM before BEAST.

When six selected cards cannot fit six columns, avoid a one-card tail. Prefer balanced layouts such as `4+2`, then `3+3`, `2+2+2`, then one-column fallback as width requires.

Current testing checkpoint intentionally sets the `full` preset to:

```text
systemMode = on
beastMode  = on
```

This is for easy testing. The intended release/customization default is `auto` unless a later product decision changes it.

`systemMode=off` must also remove SYSTEM collector demand when no other consumer requires it.

---

## 11. BEAST MODE

BEAST MODE currently exists only as an empty reserved responsive card. Runtime dog animation is not part of the closed Phase 06 checkpoint.

Future direction is a geometry-aware ASCII pet. Resize must never clip it, increase HUD height unexpectedly, intercept input, or require telemetry collectors.

Existing animation assets are design material, not proof that live Beast animation is implemented.

---

## 12. Field visibility, theme and background

Per-field visibility exists for CONTEXT, USAGE, SESSION, ACTIVITY and SYSTEM. Disabled fields should be omitted/reflowed rather than shown as fake missing values.

Themes:

```text
color
mono
matrix
```

HUD backgrounds:

```text
terminal
black
dark
```

Background styling applies only to Monitor rows and must reset before Codex content.

The polished Custom UX is future work.

---

## 13. Performance rules

Priority order:

1. Codex stdin/PTY correctness;
2. terminal resize/restore;
3. Codex lifecycle/current-session state;
4. visible UI state;
5. optional telemetry;
6. cosmetic work.

Full Live SYSTEM uses its own light bounded history and does not require the heavy performance/process collectors.

Collectors are demand-driven and scheduled centrally. Optional telemetry must never make Codex input lag.

---

## 14. Platform architecture — Phase 07 checkpoint

Supported design target:

```text
Windows
Linux
macOS
```

Canonical platform contract:

```text
spawnPty
getSystemUsage
getProcessTree
getDiskInfo
paths
capabilities
cleanup
```

`openHistoryTerminal` is obsolete and has been removed from the platform contract and Windows adapter implementation.

Normalized process shape:

```text
ProcessInfo {
  pid
  ppid
  name
  command
  cpuPercent
  memoryBytes
  ageMs
}
```

Unsupported capabilities degrade explicitly instead of crashing or fabricating data.

Optional platform telemetry must not block PTY/input. Windows CIM/PowerShell work is asynchronous/cached; POSIX `ps`/`df` execution is asynchronous and process-tree work uses a short TTL cache.

Verification status at Phase 07 close:

```text
Windows  VERIFIED — development checkpoint
Linux    UNVERIFIED PLATFORM
macOS    UNVERIFIED PLATFORM
```

Linux/macOS must remain UNVERIFIED until real-machine/CI evidence exists. Their unverified state does not block Phase 08 development, but does block any claim of release-quality cross-platform verification.

---

## 15. Session Manager direction

Session Manager owns interactive local analytics and storage management for LIVE + ENDED sessions.

Global tracking must stay lightweight; deep aggregation activates only for the selected session/view.

Primary dashboard chart direction remains:

1. Token Activity
2. Context Pressure
3. Tool Activity

Selected-session signature chart remains Context Timeline/Stream with compaction markers when evidence exists.

Detailed views remain conceptually:

```text
Info | Tokens | Turns | Tools | Resources | Errors
```

Historical resources must be evidence-based, not inferred from today's filesystem.

Session deletion is read-only by default, never automatic, never allowed for LIVE sessions, and always requires explicit confirmation.

---

## 16. Network/privacy

Normal monitoring must perform no network requests and no telemetry upload.

Do not add remote quota lookup, pricing lookup, provider metadata lookup, transcript upload, machine telemetry upload or extra model calls.

Updater/network productization is isolated from monitoring and handled in later roadmap phases.

---

## 17. Numbered roadmap status

```text
Phase 01  Correctness / terminal safety              COMPLETE checkpoint
Phase 02  Normalized state / parsers                 COMPLETE checkpoint
Phase 03  Demand / scheduler / diff infrastructure   COMPLETE checkpoint
Phase 04  Live UI / responsive / custom foundation  COMPLETE checkpoint
Phase 05  Live UI fuzz / UX gate                     COMPLETE checkpoint
Phase 06  Passive Live HUD completion                CLOSED by product decision
Phase 07  Platform adapters                          CLOSED development checkpoint
Phase 08  Session Manager core                       NEXT
Phase 09+ Session Manager UI / productization        PLANNED / scaffold may exist
```

Closing a phase means new polish moves to backlog unless it exposes a correctness/integration blocker.

Phase 06 backlog includes runtime Beast animation, polished Custom UX, richer SYSTEM storage metrics, trusted LiteLLM ROUTED telemetry, and non-blocking cosmetic refinements.

Phase 07 release backlog includes real Linux/macOS verification and a broader terminal/Windows compatibility matrix.

---

## 18. Change control

When product semantics change, update this file/version/date or add a superseding decision under `docs/decisions/`.

Do not leave major product decisions only in chat or code.
