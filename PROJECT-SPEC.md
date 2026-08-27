# Codex Monitor — PROJECT-SPEC

**Version:** 1.2 release-candidate baseline  
**Updated:** 2026-08-27  
**Status:** Phase 01–12 closed; Phase 13 implementation candidate awaiting RC verification/manual polish  
**Scope:** Codex Monitor v1

> This file is the current product/architecture source of truth. Accepted decisions under `docs/decisions/` and numbered files in `docs/RoadMap/` define detailed execution semantics where explicitly stated.

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
│       └── never owns Codex navigation/input after spawn
├── SESSION MANAGER
│   └── codexm --manager
│       ├── independent interactive TUI
│       ├── reads local LIVE + ENDED + optional ARCHIVED sessions
│       └── owns analytics and session storage management
└── PRODUCT SHELL
    ├── first-run onboarding
    ├── shared Config
    ├── doctor / diagnostics / repair
    ├── update check
    └── safe Monitor integration uninstall
```

Product laws:

1. Official Codex owns stdin after spawn.
2. Live Monitor never adds navigation hotkeys, tabs, mouse navigation, or input interception after Codex spawn.
3. Unrelated previous sessions must never fill missing current-session telemetry.
4. Exact resume may hydrate durable state from the exact resumed rollout only; transient state starts clean.
5. No extra model/API calls are made for monitoring.
6. Normal monitoring and Archive are local-only. The updater is the only automatic network exception.
7. What is not demanded should not be collected; what has not changed should not be repainted unnecessarily.
8. Windows/Linux/macOS share intended product semantics; OS differences stay behind Platform Adapters. Real release verification is claimed only per tested platform.
9. Local Session Archive is optional and Disabled until explicit user opt-in.
10. Monitor reset/uninstall must not remove official Codex auth/sessions; Archive DB is preserved unless an explicit destructive Archive flow says otherwise.

Runtime requirement for the v1 rearchitecture is Node.js `>=22.13 <27`, primarily because Archive uses built-in `node:sqlite` without an external SQLite runtime.

---

## 2. Live CLI and product-shell contract

Examples:

```powershell
codexm
codexm resume
codexm resume --last
codexm resume <thread-id>
codexm -m <model>
codexm --preset compact resume
codexm --manager
codexm --configure
codexm --doctor
```

Monitor-owned options are consumed by Codex Monitor. Unknown arguments are forwarded to official Codex.

```powershell
codexm -- --help
codexm -- --version
```

Everything after `--` is passed through unchanged.

There is no Monitor-owned public `--history` mode in v1. `--history` is forwarded to official Codex.

Phase 13 product controls include:

```text
--doctor / --diagnostics
--repair
--update
--uninstall
--version / --monitor-version
--config / --config-path
--configure / --reset
```

`--version` is Monitor-owned; use the exact `--` boundary when the official Codex version is desired.

---

## 3. Data ownership and resume

Codex owns raw session history:

```text
~/.codex/sessions/**/*.jsonl
```

Codex Monitor does not maintain a second transcript/history database by default. When Local Session Archive is explicitly enabled, it maintains a Monitor-owned technical analytics SQLite archive; it is not a transcript/conversation-memory database.

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

Future workspace/disk/Codex-home sizing is backlog.

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

The current `full` preset intentionally keeps SYSTEM/BEAST explicitly visible for testing/product richness; final visual preference remains subject to Phase 13 polish without changing the mode semantics.

`systemMode=off` must also remove SYSTEM collector demand when no other consumer requires it.

---

## 11. BEAST MODE

BEAST MODE is a geometry-aware cosmetic surface and must remain isolated from correctness/telemetry/input paths. Animation/design assets do not justify input interception or extra collector demand.

Resize must never clip it in a way that corrupts the terminal, unexpectedly expand the protected HUD region, or affect Codex stdin ownership.

Final pet art/animation polish may continue during Phase 13 as cosmetic work provided it does not alter product semantics.

---

## 12. Field visibility, Config, theme and background

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

Phase 12 owns the shared configuration product surface. `Manager -> C` and `codexm --configure` share the same schema/controller. Config edits are draft-based; Preview does not save, Revert restores saved state, and Archive lifecycle effects occur only after a successful explicit Save.

First-run onboarding occurs before Codex spawn only. Existing valid configs migrate without forced onboarding. Runtime Manager `V` cycling does not persist a new default unless explicitly saved.

Reset changes Monitor preference draft only and never deletes Codex auth/sessions or Archive SQLite data.

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

Collectors are demand-driven and scheduled centrally. Optional telemetry and Archive work must never make Codex input lag.

Archive SQLite/service work must stay off the Codex stdin/PTY critical path. Archive failure must fail soft so Live/Codex remains usable.

---

## 14. Platform architecture

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

`openHistoryTerminal` is obsolete and removed from the platform contract.

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

Current real-machine verification status:

```text
Windows  VERIFIED — development/Phase 12 focused UX evidence; Phase 13 RC checklist pending
Linux    UNVERIFIED PLATFORM
macOS    UNVERIFIED PLATFORM
```

Linux/macOS must remain UNVERIFIED until real-machine/CI evidence exists. Their unverified state blocks any claim of release-quality verification for those platforms, not continued source development.

---

## 15. Session Manager

Session Manager owns interactive local analytics and storage management for LIVE + ENDED sessions and, when Archive is enabled, ARCHIVED analytics history.

Global tracking must stay lightweight; deep aggregation activates only for the selected session/view.

Primary dashboard chart direction remains:

1. Token Activity
2. Context Pressure
3. Tool Activity

Selected-session signature chart remains Context Timeline/Stream with compaction markers when evidence exists.

Detailed views are implemented around session info/analytics/timeline concepts and may adapt labels/layout responsively.

Historical resources must be evidence-based, not inferred from today's filesystem.

Session deletion is read-only by default, never automatic, never allowed for LIVE sessions, and always requires explicit confirmation.

Manager presentation modes are:

```text
Operations
Table
Charts
Auto
```

The saved default and one-shot `--manager-view` override are distinct. Runtime `V` does not silently persist.

---

## 16. Local Session Archive

Local Session Archive is optional/local-only technical analytics storage using Node's built-in `node:sqlite` / `DatabaseSync`.

Data ownership:

```text
Codex JSONL     = Codex-owned raw source
Archive SQLite  = Monitor-owned technical analytics archive
```

Archive defaults:

```text
enabled      false
retention    forever
autoCleanup  false
sizeLimit    off
```

Correctness law:

> Codex hook and filesystem-watch events are signals only. Missed signals must not cause missed data because startup/recovery/safety reconcile re-discovers JSONL and resumes from committed offsets.

Committed offsets must advance only after corresponding analytics changes commit successfully. Duplicate signals must not duplicate analytics rows.

Enable lifecycle after explicit successful Config Save:

```text
open/migrate SQLite -> install Monitor-owned hooks -> start/wake service -> reconcile
```

Disable lifecycle:

```text
request service stop -> remove only Monitor-owned hooks -> keep SQLite DB
```

Archive Disabled must not cause normal Live/Manager launch to start the Archive Service.

An ARCHIVED session may remain after raw JSONL is deleted. Therefore clearing Archive can destroy non-rebuildable analytics history and is not equivalent to deleting Codex raw sessions.

Archive failure, lock/corruption/staleness or service failure must degrade honestly without blocking Codex input/PTY/Live rendering.

---

## 17. Network, privacy and security

Normal monitoring, Manager and Local Session Archive perform no telemetry upload and no monitoring/archive network lookup.

Do not add remote quota lookup, pricing lookup, provider metadata lookup, transcript upload, machine telemetry upload or extra model calls.

The updater is the sole automatic network exception:

- source of truth: GitHub Releases metadata;
- background check throttled to approximately once per 24h;
- disable-able in Config;
- startup/runtime check must be non-blocking and TUI-silent;
- auto-install is Off;
- failure never blocks Live/Manager/Archive;
- it must not upload prompts, project data, tokens, session content or Archive data.

Doctor/diagnostics may report sanitized versions/platform/auth-mode source and Archive health categories/counts, but must not dump prompts, assistant responses, full tool output, raw transcripts, tokens or arbitrary raw filesystem error messages.

Repair/uninstall may alter only Monitor-owned Archive integration. They must not modify official Codex binaries/auth/sessions or unrelated hooks/plugins. Built-in uninstall preserves Monitor config and Archive DB; package removal is a separate package-manager operation.

---

## 18. Packaging and release contract

The npm package exposes:

```text
codexm -> ./src/cli/codexm.js
```

Package allowlist must not include local config/auth/session/archive runtime data. Release artifact generation produces an npm tarball plus `SHA256SUMS`.

Clean install does not enable Archive automatically. Upgrade migrations must preserve Monitor config and Archive history where supported; schema/config mismatch must never silently delete/recreate user data merely to recover.

Real package/link installation, update/uninstall UX, performance baseline, signing/timestamping and visual approval remain Phase 13 release gates rather than assumptions from source tests.

---

## 19. Numbered roadmap status

```text
Phase 01   Correctness / terminal safety                         CLOSED
Phase 02   Normalized state / parsers                            CLOSED
Phase 03   Demand / scheduler / diff infrastructure              CLOSED
Phase 04   Live UI / responsive / custom foundation              CLOSED
Phase 05   Live UI fuzz / UX gate                                CLOSED
Phase 06   Passive Live HUD completion                           CLOSED
Phase 07   Platform adapters                                     CLOSED development checkpoint
Phase 08   Session Manager core                                  CLOSED
Phase 09   Session Manager dashboard TUI                         CLOSED
Phase 10   Session detail analytics / live dynamics              CLOSED
Phase 11   Session storage / delete safety / Manager QA          CLOSED
Phase 11-1 Local Session Archive                                 IMPLEMENTED; release review active in Phase 13
Phase 12   Product shell / CLI / onboarding / Config             CLOSED; auto verified; focused Windows UX passed
Phase 13   Productization / full QA / packaging / RC             IMPLEMENTED candidate; auto/manual RC gates pending
```

Closing a phase means new polish moves to backlog unless it exposes a correctness/integration/release blocker. Phase 13 is the final place for cross-phase release hardening and user-driven visual/copy/interaction polish before RC close.

Linux/macOS release verification, package signing/timestamping and any explicitly unverified platform/distribution item must stay labeled honestly rather than inferred from source adapters or Windows tests.

---

## 20. Change control

When product semantics change, update this file/version/date or add a superseding accepted decision under `docs/decisions/`.

Do not leave major product decisions only in chat or code.
