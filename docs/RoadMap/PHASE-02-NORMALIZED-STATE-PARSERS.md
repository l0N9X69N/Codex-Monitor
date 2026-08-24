# Phase 02 — Normalized State & Parser Test Harness

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.

## Spec liên quan

Spec mục 3, 8–10, 18–23, 56, 58.

## Mục tiêu

Tạo một Normalized Monitor State duy nhất để UI, History và collectors không tự đọc raw event theo cách riêng.

## Phạm vi phải làm

- Chuẩn hóa domain: auth, model, context, usage, quota, session, activity, compaction, git, system, resources, freshness.
- Tách provenance: official/current, local, derived, unknown.
- Tách rollout JSONL parser, incremental append parser, PTY transient parser khỏi renderer.
- Chuẩn hóa tool lifecycle, turn lifecycle, retry/error/compaction, usage/quota/model/reasoning.
- Derived state: context used/left, cache ratio nếu hợp lệ, turns/age since compact, Session Health inputs.
- Sanitize ANSI/control characters và tool/resource detail trước khi lên ViewModel.
- Tạo fixture library và test helper synthetic session.

## Không làm trong phase

- Chưa chốt cứng threshold Session Health nếu chưa có dữ liệu test thực tế.
- Chưa làm renderer mới toàn diện.
- Chưa làm History full parser.

## Đầu ra bắt buộc

- Normalized state API/schema.
- Parser modules độc lập UI.
- Sanitized fixtures.
- Unit-test harness chuẩn.

Ngoài ra luôn phải có bộ bàn giao chung:

```text
PHASE-02-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Auto test

- Table-driven tests cho IDLE/THINKING/TOOL/APPROVAL/ERROR.
- Concurrent tools; retry; stream error; compaction; turn start/complete.
- Malformed JSON; missing fields; partial appended line.
- ANSI/control-char injection.
- Unknown không tự biến thành 0.
- Derived state không masquerade thành official state.

## Manual test / phần cần người dùng xác nhận

- Chỉ yêu cầu test PTY wording thật nếu official Codex có signal khó mô phỏng: approval, cancel/deny, tool error, retry, compaction.

Nếu không thể auto test đáng tin, phase phải ghi rõ case trong `MANUAL-TEST-REQUIRED.md`; không được im lặng coi như đã PASS.

## Exit gate

Parser/state tests xanh và renderer không cần đọc raw rollout trực tiếp.

## Trạng thái hiện tại

```text
IMPLEMENTED — WAITING AUTOMATED VERIFICATION
```

Chạy:

```powershell
.\scripts\phase2-verify.ps1
```

Phase 02 chỉ chuyển sang `CLOSED` khi syntax + full cumulative regression + focused parser/ingest tests đều PASS.
