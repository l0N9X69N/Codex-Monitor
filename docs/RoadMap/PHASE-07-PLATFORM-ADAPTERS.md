# Phase 07 — Platform Adapters: Windows / Linux / macOS

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline, frozen 2026-08-25.

## Spec liên quan

Sections 28–31, 34, 36, 40 và 42.

## Mục tiêu

Giữ cùng product semantics/UI/config trên Windows, Linux và macOS; toàn bộ khác biệt OS nằm sau Platform Adapter. Phase 07 không thêm feature UI mới và không quay lại mô hình History launcher/F4 cũ.

## Platform contract mục tiêu

```text
spawnPty
getSystemUsage
getProcessTree
getDiskInfo
paths
capabilities
cleanup
```

Có thể bổ sung primitive platform-specific phục vụ installer/updater/terminal capability nếu thật sự cần, nhưng core không được rải `process.platform` khắp business logic.

## Phạm vi phải làm

- Windows: ConPTY/PTTY spawn, process/system CPU-RAM, disk, paths, terminal restore/signals.
- Linux: POSIX PTY, `ps`/system/disk/path primitives.
- macOS: POSIX PTY, process/system/disk/path primitives.
- Fake adapter + contract tests.
- Normalized process shape chung.
- Capability fallback: unsupported metric -> `--`, không crash.
- Benchmark/polling cost cho optional system/process collectors.
- Không network fetch trong platform telemetry.

## Không làm trong Phase 07

- Không `openHistoryTerminal`/F4 History contract.
- Không Manager analytics UI.
- Không installer/updater hoàn chỉnh; productization ở Phase 12.
- Không giả PASS platform chưa test thật.

## Verification policy

```text
Windows  phải verify thật trong môi trường hiện tại
Linux    UNVERIFIED PLATFORM nếu chưa có máy/CI thật
macOS    UNVERIFIED PLATFORM nếu chưa có máy/CI thật
```

Linux/macOS chưa verify không block việc tiếp tục development sau khi Windows gate xanh, nhưng không được tuyên bố release-quality cross-platform PASS.

## Auto test bắt buộc

- adapter contract;
- normalized process/system/disk result shape;
- unsupported capability degrade safe;
- no OS branching leak trong core paths được phase này chạm tới;
- fake adapter deterministic;
- terminal cleanup idempotent;
- platform paths không đụng Codex auth/history khi reset Monitor.

## Manual Windows

- Live typing/resize/Ctrl+C/`/exit`;
- CPU/RAM/process values tương đối hợp lý hoặc `--`;
- terminal restore sạch;
- config/session paths hợp lý;
- weak/slow collector không làm lag Codex input.

## Deliverables

`docs/qa/phase-07/` chứa đủ 4 handoff files và compatibility status rõ từng OS.

## Exit gate

Windows PASS, BLOCKER=0, P0=0, Linux/macOS được ghi đúng VERIFIED/UNVERIFIED thay vì suy đoán.

## Trạng thái hiện tại

```text
NOT STARTED UNDER 2026-08-25 BASELINE
```
