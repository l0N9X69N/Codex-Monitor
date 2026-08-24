# Phase 07 — Known Issues / Deferred

## Platform status

```text
Windows  WAITING USER VERIFY
Linux    UNVERIFIED PLATFORM
macOS    UNVERIFIED PLATFORM
```

## Known risk requiring Windows manual test

- CIM process query cost/availability can vary by Windows installation.
- Windows Terminal F4 escape sequence/launcher behavior must be verified in real terminal.

## Graceful degradation

Unavailable process/disk/terminal features return unsupported/fallback state rather than fabricate telemetry.

## Deferred

Linux/macOS real-machine verification remains open until hardware/CI is available. Do not record PASS from contract tests alone.
