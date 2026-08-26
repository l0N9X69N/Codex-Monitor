# Phase 07 — Known Issues / Deferred

## Platform status

```text
Windows  VERIFIED — development checkpoint
Linux    UNVERIFIED PLATFORM
macOS    UNVERIFIED PLATFORM
```

## Remaining risks

- Windows CIM/PowerShell process-query cost and availability can vary across installations. Current queries are asynchronous and short-TTL cached, but broader hardware/Windows-version benchmarking is deferred to productization.
- Linux and macOS adapters have contract/parser coverage but no real-machine verification recorded in this checkpoint.
- True release-quality terminal capability/restore matrices across shells and terminal emulators remain a later compatibility task.

## Graceful degradation

Unavailable process/disk capabilities must return structured unsupported/unknown state rather than fabricate telemetry or crash Live.

## Closed legacy issue

The obsolete Monitor History/F4 platform launcher is no longer part of the adapter contract and has been removed from the Windows adapter implementation. Session Manager remains the only Monitor-owned historical/session-management UI.
