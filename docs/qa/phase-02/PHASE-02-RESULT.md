# Phase 02 — Result

## Trạng thái

**IMPLEMENTED — chờ chạy automated verification trên máy người dùng.**

## Đã làm

- Tạo `NormalizedMonitorState` duy nhất cho auth/model/context/usage/quota/session/activity/compaction/git/system/resources/freshness.
- Mỗi metric có `value`, `freshness`, `provenance`, `updatedAtMs`.
- Provenance tách `official-current`, `local`, `derived`, `unknown`.
- Phase 01 state API đã migrate sang normalized state, không duy trì một state tree thứ hai.
- Tách rollout parser khỏi UI/renderer.
- Hỗ trợ envelope rollout phổ biến `event_msg` / `response_item`.
- Tạo incremental JSONL parser, giữ partial line cho append tiếp theo.
- Tạo PTY transient parser độc lập renderer.
- Tạo reducer cho turn/tool/approval/retry/error/compaction/usage/quota/model.
- Concurrent tool lifecycle được giữ đúng cho đến khi tất cả tool kết thúc.
- Derived context left/percent, cache ratio, turns since compact có provenance `derived`.
- Sanitization ANSI/control character trước khi detail đi vào normalized state.
- Synthetic session helper + focused parser tests + ingest integration tests.
- Tạo `MonitorIngestPipeline` để raw rollout/PTY chỉ đi qua parser/reducer rồi mới đến normalized state.

## Không làm trong Phase 02

- Renderer mới: Phase 03/04.
- Demand scheduler: Phase 03.
- Full History parser: Phase 08.
- Session Health threshold cố định: chưa chốt ở Phase 02.

## Exit gate còn lại

Chạy:

```powershell
.\scripts\phase2-verify.ps1
```

Cần PASS cả syntax, full regression và focused Phase 02 tests. Nếu có wording PTY thật mà fixtures chưa nhận diện, ghi lại case theo `MANUAL-TEST-REQUIRED.md`.
