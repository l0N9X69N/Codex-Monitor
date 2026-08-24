# Phase 02 — Auto Test Report

## Trạng thái

**WAITING USER RUN**

Automated runner đã được tạo nhưng chưa được coi là PASS cho đến khi chạy trên working tree đã pull đầy đủ.

## Lệnh chuẩn

```powershell
.\scripts\phase2-verify.ps1
```

Script chạy:

```text
Syntax check
Full cumulative regression: node --test
Focused Phase 02 parser/ingest tests
```

## Coverage Phase 02

- normalized state domains/provenance;
- IDLE/THINKING/TOOL/APPROVAL/ERROR;
- concurrent tools;
- retry/error/compaction;
- turn start/complete + duration;
- usage/context/cache derived metrics;
- Login/API Phase 01 regression vẫn được chạy trong full suite;
- rate-limit 5H/Week normalization;
- malformed JSON;
- partial appended JSONL line;
- rollout `event_msg`/`response_item` envelope;
- ANSI/control character sanitization;
- PTY transient parser;
- requested model không tự biến thành actual model.

## PASS condition

```text
Syntax PASS
Full regression FAIL = 0
Focused Phase 02 FAIL = 0
```

Khi user gửi output, file này sẽ được cập nhật bằng số test thực tế và trạng thái cuối.
