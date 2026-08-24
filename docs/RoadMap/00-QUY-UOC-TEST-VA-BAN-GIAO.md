# Quy ước Test & Bàn giao cho mọi Phase

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.


## Nguyên tắc

Ưu tiên kiểm thử theo thứ tự:

1. Unit test tự động.
2. Integration test tự động.
3. Snapshot/golden test.
4. Property/fuzz test.
5. E2E tự động nếu môi trường cho phép.
6. Manual test có hướng dẫn chính xác cho phần không thể kiểm chứng đáng tin bằng automation.

**Cái gì auto test được thì phải auto test. Cái gì không auto test được thì phải trả ra file yêu cầu người dùng test.**

## File bàn giao bắt buộc mỗi phase

```text
PHASE-N-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

Nếu phase không cần test tay, `MANUAL-TEST-REQUIRED.md` vẫn phải tồn tại và ghi rõ:

```text
Không có manual test bắt buộc cho phase này.
```

Nếu cần test tay, mỗi case phải có:

```text
ID
Mức độ: P0/P1/P2
Môi trường
Điều kiện trước test
Các bước
Kết quả mong đợi
Dấu hiệu FAIL
Thông tin cần gửi lại khi FAIL
```

Không bao giờ yêu cầu người dùng gửi API key, access token, password hoặc raw auth header.

## Nội dung AUTO-TEST-REPORT.md

Phải có:

- Lệnh test thực tế đã chạy.
- OS / Node / Codex / Monitor version nếu liên quan.
- Số test Passed / Failed / Skipped.
- Thời gian.
- Coverage nếu project đã cấu hình.
- Benchmark nếu phase liên quan performance.

Không được tuyên bố PASS nếu test thực tế chưa chạy.

## Test fixture

Nên giữ fixture đã sanitize:

```text
test/fixtures/
├── login/
├── api/
├── activity/
├── history/
├── unicode/
└── terminal/
```

Fixture không chứa secret hoặc prompt nhạy cảm không cần thiết.

## Golden / snapshot test

Snapshot phải:

- normalize timestamp/random value;
- kiểm tra terminal-cell width chứ không chỉ `string.length`;
- không update snapshot hàng loạt chỉ để làm test xanh;
- được review như một thay đổi UI thật.

## Property / fuzz test cho layout

Sinh nhiều tổ hợp:

```text
terminal width/height
sections
metrics
header items
tabs
theme
API/Login/unknown
Unicode/emoji/Tiếng Việt
```

Invariant tối thiểu:

```text
không crash
không negative width
không border overflow
không telemetry word-wrap ngoài ý muốn
HUD không vượt row budget
ANSI reset đầy đủ
frame width đúng terminal-cell width
```

## Performance instrumentation

Có thể thêm test-only counters:

```text
collectorRuns
pollCount
frameBuilds
repaintCount
bytesWritten
collectorDuration
```

Dùng để chứng minh:

```text
Không hiển thị -> không collect
Không xem -> không continuously poll
Không đổi -> không repaint
PTY luôn ưu tiên telemetry
```

Instrumentation phải tắt được trong release build.

## Security/privacy test

Auto test tối thiểu:

- diagnostics redaction;
- ANSI/control-character sanitization;
- config không chứa secret;
- Resources không hiển thị secret;
- updater không gửi project/activity/token/machine stats;
- History không tạo DB ngoài spec.

## Exit gate chung

Chỉ được đóng phase nếu:

```text
mandatory auto tests PASS
BLOCKER = 0
P0 = 0
manual P0/P1 đã được user xác nhận nếu cần
deliverables đầy đủ
```
