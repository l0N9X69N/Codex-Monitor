# Phase 13 Manual Test Required

Status: **REQUIRED — RELEASE CANDIDATE / POLISH GATE**

Use `docs/RELEASE-MANUAL-CHECKLIST.md` as the complete PASS / FAIL / N/A record.

The first target for this branch is Windows Terminal / PowerShell. Linux and macOS remain `UNVERIFIED PLATFORM` until tested on real machines or an equivalent CI environment.

## Focused first pass after auto verification

```powershell
git pull
npm link
codexm --version
codexm --help
codexm --doctor
codexm --diagnostics
codexm --update
codexm -- --version
codexm --manager
codexm --configure
```

Then exercise a normal Live launch and the Manager/Config/Archive workflows visually. Record anything that feels wrong even if it is not a correctness bug; Phase 13 is where final visual/copy/interaction polish is fixed.

For Archive lifecycle/destructive tests, use disposable config/data/session fixtures whenever possible. Do not casually delete real `~/.codex/sessions` data.

`codexm --uninstall` removes Monitor-owned hook/service integration but deliberately preserves Monitor config, Archive SQLite, official Codex auth and official Codex sessions. Test package removal separately using npm only when ready.

Before Release Candidate close, record:

- full Windows release checklist result;
- actual package/link install behavior;
- Archive OFF/ON/OFF lifecycle evidence;
- missed-signal/restart recovery evidence;
- release artifact + SHA256SUMS;
- performance baseline on the target machine;
- visual/input/terminal-restore approval;
- BLOCKER/P0 counts;
- signing/timestamp result or explicit N/A reason;
- Linux/macOS as PASS or UNVERIFIED, never inferred.
