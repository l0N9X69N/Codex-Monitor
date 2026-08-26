# Phase 07 — Platform Adapters: Windows / Linux / macOS

> **Nguồn chuẩn:** `PROJECT-SPEC.md` v1.1 — updated 2026-08-26.

## Trạng thái

```text
ACTIVE — 2026-08-26
```

Phase 06 đã đóng theo product decision. Phase 07 không quay lại polish Live HUD trừ khi phát hiện blocker correctness/integration.

## Mục tiêu

Giữ cùng product semantics/UI/config trên Windows, Linux và macOS; toàn bộ khác biệt OS nằm sau Platform Adapter. Phase 07 không thêm feature UI mới và không quay lại mô hình History launcher/F4 cũ.

## Platform contract chuẩn

```text
spawnPty
getSystemUsage
getProcessTree
getDiskInfo
paths
capabilities
cleanup
```

`openHistoryTerminal` không còn thuộc contract. `--history` không phải Monitor-owned feature.

Có thể bổ sung primitive platform-specific phục vụ installer/updater/terminal capability ở phase productization nếu thật sự cần, nhưng core không được rải `process.platform` khắp business logic.

## Phạm vi phải làm

- Windows: ConPTY/PTTY spawn, process/system CPU-RAM, disk, paths, terminal restore/signals.
- Linux: POSIX PTY, `ps`/system/disk/path primitives.
- macOS: POSIX PTY, process/system/disk/path primitives.
- Fake adapter + contract tests.
- Normalized process/system/disk result shape chung.
- Capability fallback: unsupported metric -> unknown/unsupported, không crash.
- Benchmark/polling cost cho optional system/process collectors.
- Không network fetch trong platform telemetry.
- Optional platform command execution không được block event loop/PTY.

## Đã hoàn tất trong checkpoint đầu Phase 07

- `PROJECT-SPEC.md` đã cập nhật thành implementation baseline v1.1.
- Loại `openHistoryTerminal` khỏi `PLATFORM_METHODS` và capability contract.
- Fake adapter đã đồng bộ contract mới.
- POSIX `ps`/`df` chuyển từ synchronous child-process execution sang async execution.
- POSIX process-tree có short TTL cache để tránh spawn lặp sát nhau.
- Thêm parser tests cho normalized `ps`/`df` shape.
- Thêm tests cho unsupported result, capabilities và cleanup idempotence.
- Thêm `npm run verify:phase7` / `scripts/phase7-auto-verify.mjs`.

## Việc còn lại

- Dọn helper `openHistoryTerminal` legacy còn tồn tại trong Windows implementation source; nó không còn được contract/core sử dụng.
- Rà terminal cleanup/signal ownership xuyên Windows/POSIX runtime path.
- Rà platform-specific branches ngoài `src/platform/` ở các path Phase 07 chạm tới.
- Benchmark thực tế Windows cho system/process/disk collectors.
- Xác nhận Windows paths/capabilities bằng manual acceptance.
- Chỉ đánh dấu Linux/macOS VERIFIED khi có môi trường thật/CI thật.

## Không làm trong Phase 07

- Không Manager analytics UI.
- Không installer/updater hoàn chỉnh; productization ở phase sau.
- Không storage-recursive scan mới chỉ để làm đẹp SYSTEM.
- Không Beast animation runtime.
- Không giả PASS platform chưa test thật.

## Verification policy

```text
Windows  phải verify thật trong môi trường hiện tại
Linux    UNVERIFIED PLATFORM nếu chưa có máy/CI thật
macOS    UNVERIFIED PLATFORM nếu chưa có máy/CI thật
```

Linux/macOS chưa verify không block development sau khi Windows gate xanh, nhưng không được tuyên bố release-quality cross-platform PASS.

## Auto test bắt buộc

- adapter contract;
- normalized process/system/disk result shape;
- unsupported capability degrade safe;
- no obsolete History launcher in contract;
- no OS branching leak trong core paths được phase này chạm tới;
- fake adapter deterministic;
- terminal cleanup idempotent;
- platform paths không đụng Codex auth/history khi reset Monitor;
- Phase 06 Live/platform integration regression.

Run:

```powershell
npm run verify:phase7
```

## Manual Windows

- Live typing/resize/Ctrl+C/`/exit`;
- CPU/RAM/process values tương đối hợp lý hoặc unknown;
- terminal restore sạch;
- config/session paths hợp lý;
- weak/slow collector không làm lag Codex input.

## Deliverables

`docs/qa/phase-07/` sẽ chứa handoff/compatibility status khi manual gate bắt đầu.

## Exit gate

Windows PASS, BLOCKER=0, P0=0, Linux/macOS được ghi đúng VERIFIED/UNVERIFIED thay vì suy đoán.
