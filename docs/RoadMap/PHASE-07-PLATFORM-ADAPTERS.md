# Phase 07 — Platform Adapters: Windows / Linux / macOS

> **Nguồn chuẩn:** `PROJECT-SPEC.md` v1.1 — updated 2026-08-26.

## Trạng thái

```text
CLOSED — WINDOWS DEVELOPMENT CHECKPOINT PASS — 2026-08-26
```

Phase 06 đã đóng theo product decision. Phase 07 hiện cũng đóng cho development continuation; Linux/macOS release verification vẫn để mở và phải được ghi đúng là UNVERIFIED cho tới khi có môi trường thật.

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

`openHistoryTerminal` không còn thuộc contract hoặc Windows implementation. `--history` không phải Monitor-owned feature.

## Hoàn tất

- Windows: PTY/ConPTY path, asynchronous cached CIM system/process CPU-RAM, disk, paths.
- Linux/macOS: POSIX PTY plus asynchronous `ps`/`df` system/process/disk primitives.
- Fake adapter + shared contract tests.
- Normalized process/system/disk result shape chung.
- Unsupported capability degrade an toàn, không fabricate telemetry.
- POSIX process-tree short TTL cache.
- Windows expensive CIM calls asynchronous + cached.
- Không network fetch trong platform telemetry.
- Obsolete History/F4 launcher removed from platform contract and Windows source.
- `npm run verify:phase7` gate added and reported PASS by user.
- Windows Live manual development acceptance reported stable enough to continue: typing, resize, SYSTEM telemetry, Ctrl+C/exit path showed no blocking issue.
- QA handoff under `docs/qa/phase-07/` updated to current reality.

## Verification matrix

```text
Windows  VERIFIED — development checkpoint
Linux    UNVERIFIED PLATFORM
macOS    UNVERIFIED PLATFORM
```

Linux/macOS chưa verify không block Phase 08 development, nhưng không được tuyên bố release-quality cross-platform PASS.

## Deferred / release compatibility work

- Real Linux machine/CI verification.
- Real macOS machine/CI verification.
- Broader Windows hardware/version/terminal benchmark matrix.
- Productization-level shell/terminal restore compatibility matrix.
- Installer/updater/signing remain later phases.

## Không làm trong Phase 07

- Không Manager analytics UI.
- Không installer/updater hoàn chỉnh.
- Không storage-recursive scan chỉ để làm đẹp SYSTEM.
- Không Beast animation runtime.
- Không giả PASS platform chưa test thật.

## Verification gate

```powershell
npm run verify:phase7
```

User reported PASS on 2026-08-26.

## Exit gate

```text
Windows development gate  PASS
BLOCKER                  0 reported
P0                       0 reported
Linux                    UNVERIFIED
macOS                    UNVERIFIED
```

**Decision:** Phase 07 development checkpoint CLOSED. Phase 08 may start.
