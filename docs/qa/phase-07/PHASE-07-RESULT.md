# Phase 07 — Result

## Trạng thái

**IMPLEMENTED — Windows chờ verification; Linux/macOS = UNVERIFIED PLATFORM.**

## Đã làm

- Platform contract: `spawnPty/getSystemUsage/getProcessTree/getDiskInfo/openHistoryTerminal/paths/capabilities/cleanup`.
- Fake adapter cho unit/integration tests.
- Windows adapter: ConPTY, CIM system/process CPU-RAM, disk, Windows Terminal launcher + cmd fallback.
- Linux adapter: POSIX PTY, ps/df/system, terminal launcher chain.
- macOS adapter: POSIX PTY, ps/df/system, Terminal.app launcher.
- Codex paths và Monitor config path logic được gom dưới platform helpers.
- Core/UI không fork semantics theo OS.
- F4 Live gọi `openHistoryTerminal` qua adapter và có fallback command.

## Verification matrix hiện tại

```text
Windows  WAITING USER VERIFY
Linux    UNVERIFIED PLATFORM
macOS    UNVERIFIED PLATFORM
```

Không được đổi Linux/macOS sang PASS cho tới khi có máy/CI phù hợp.
