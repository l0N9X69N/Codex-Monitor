# Decision — Product Shell / CLI / First-run Onboarding is a dedicated Phase 12

**Date:** 2026-08-26  
**Status:** ACCEPTED  
**Applies to:** Codex Monitor v1 roadmap after Phase 09

## Decision

The roadmap is expanded from 12 to 13 phases.

```text
Phase 12  Product Shell, CLI Router, First-run Onboarding & Configuration UX
Phase 13  Productization, Full QA, Packaging & Release Candidate
```

The former Phase 12 release-candidate work is moved to Phase 13. Release hardening must not be responsible for inventing product-shell semantics at the end of the project.

## Why

Live Monitor, Manager, config schema, themes and control commands were developed incrementally, but no phase previously owned the complete outer product UX:

- first interactive launch;
- command routing;
- CLI vs persisted config precedence;
- configure/reset behavior;
- Manager default-view persistence;
- onboarding save/cancel/migration;
- non-interactive no-prompt rules.

These are feature/UX semantics, not merely release hardening.

## Product laws added by this decision

1. First-run onboarding occurs only before official Codex spawn.
2. Once Codex is spawned, official Codex retains all stdin ownership; onboarding creates no Live hotkeys.
3. Existing valid Monitor configs migrate without forcing onboarding again.
4. Non-interactive commands never block on the onboarding wizard.
5. Explicit CLI override wins for one run; persisted preference remains unchanged unless the user explicitly saves a change.
6. Monitor reset never touches official Codex auth or session history.
7. Manager default view is one of `Operations / Table / Charts / Auto`.
8. Manager runtime `V` switching does not silently persist a new default.
9. `--manager-view` is the intended one-shot Manager presentation override.
10. Unknown Codex arguments and the `--` passthrough contract remain intact; Monitor does not gain a public `--history` mode.

## Configuration target

Phase 12 owns migration toward a config shape containing an explicit setup state and Manager preference, conceptually:

```json
{
  "setupComplete": true,
  "preset": "recommended",
  "theme": "color",
  "background": "terminal",
  "manager": {
    "view": "operations"
  }
}
```

The exact `configVersion` may advance before implementation; semantic ownership is what is frozen here.

## First-run UX target

Interactive clean install:

```text
Welcome
  -> Language
  -> Live preset
  -> Custom options when Custom is selected
  -> Theme/background
  -> Manager default view
  -> Preview/summary
  -> explicit Save / Back / Cancel
```

Future launches use saved preferences directly. `codexm --configure` reopens the same state machine with current values preselected. `codexm --reset` resets Monitor preferences only and, when interactive, may return to onboarding.

## Detailed execution spec

See:

```text
docs/RoadMap/PHASE-12-PRODUCT-SHELL-CLI-ONBOARDING.md
```

Release hardening follows only after Phase 12 closes:

```text
docs/RoadMap/PHASE-13-PRODUCTIZATION-RELEASE.md
```

## Change-control note

This decision supplements `PROJECT-SPEC.md` until its next consolidated version bump. If an older section calls polished Custom UX simply “future work” or groups all post-Manager productization together, this accepted decision and the numbered Phase 12/13 roadmap provide the newer execution semantics.
