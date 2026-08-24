# Phase 07 — Platform Adapters: Windows / Linux / macOS

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24.

## Mục tiêu

Giữ semantics/UI/config chung, cô lập OS-specific behavior sau Platform Adapter.

## Contract

```text
spawnPty
getSystemUsage
getProcessTree
getDiskInfo
openHistoryTerminal
paths
capabilities
cleanup
```

## Implementation

- Windows: ConPTY, CIM system/process CPU-RAM, disk, Windows Terminal/cmd History launcher.
- Linux: POSIX PTY, ps/df/system, launcher chain.
- macOS: POSIX PTY, ps/df/system, Terminal.app launcher.
- Fake adapter + contract tests.
- Graceful unsupported paths; core/UI không fork metric semantics theo OS.

## Verification policy

Nếu chưa có máy thật phải ghi `UNVERIFIED PLATFORM`, không được giả PASS.

```text
Windows  WAITING USER VERIFY
Linux    UNVERIFIED PLATFORM
macOS    UNVERIFIED PLATFORM
```

## Deliverables

`docs/qa/phase-07/` chứa đủ 4 handoff files.

## Trạng thái hiện tại

```text
IMPLEMENTED — WINDOWS WAITING BATCH VERIFY; LINUX/macOS UNVERIFIED PLATFORM
```

Batch command:

```powershell
.\scripts\phase6-9-verify.ps1
```
