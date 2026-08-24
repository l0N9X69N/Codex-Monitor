# Phase 07 — Platform Adapters: Windows / Linux / macOS

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.


## Spec liên quan

Spec Phase C; mục 4, 24, 57, 60.

## Mục tiêu

Giữ semantics/UI/config chung, cô lập OS-specific behavior sau Platform Adapter.

## Phạm vi phải làm

- Interface: spawnPty, getSystemUsage, getProcessTree, getDiskInfo, openHistoryTerminal, paths, cleanup/capabilities.
- Windows: ConPTY, process/system, Windows Terminal launcher/fallback.
- Linux: POSIX PTY, process/system, terminal launcher/fallback, XDG/home.
- macOS: POSIX PTY, process/system, Terminal/iTerm adapter/fallback.
- Graceful degradation khi feature OS không khả dụng.
- Không rải `if win32/linux/darwin` trong core/UI.

## Không làm trong phase

- Không fork UI theo OS.
- Không thay đổi metric semantics chỉ vì OS khác.

## Đầu ra bắt buộc

- Platform contract.
- 3 adapters.
- Fake adapter cho unit tests.
- Capability matrix.

Ngoài ra luôn phải có bộ bàn giao chung:

```text
PHASE-07-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Auto test

- Contract tests với fake adapter.
- CI matrix Windows/Linux/macOS nếu hạ tầng cho phép.
- Unsupported/error paths safe.
- Cleanup/path normalization tests.

## Manual test / phần cần người dùng xác nhận

- Mỗi OS: launch, typing, resize, Ctrl+C/exit, F4 History, CPU/RAM, process tree, config path.
- Nếu chưa có máy thật: report phải ghi `UNVERIFIED PLATFORM`, không được giả vờ PASS.

Nếu không thể auto test đáng tin, phase phải ghi rõ case trong `MANUAL-TEST-REQUIRED.md`; không được im lặng coi như đã PASS.

## Exit gate

Core/UI không có OS branching tràn lan; adapter contract xanh; tình trạng verification từng OS rõ ràng.

## Trạng thái ban đầu

```text
NOT STARTED
```
