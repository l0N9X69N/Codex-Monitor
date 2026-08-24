# Phase 02 — Result

## Trạng thái

**CLOSED — automated verification PASS; không có manual P0/P1 bắt buộc.**

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

## Verification thực tế

Chạy trên Windows / PowerShell, Node.js v24.19.0:

```powershell
.\scripts\phase2-verify.ps1
```

Kết quả:

```text
Syntax files checked:        41
Full regression:             45 / 45 PASS
Focused Phase 02:            15 / 15 PASS
Failed:                      0
Skipped:                     0
Cancelled:                   0
```

## Manual gate

Không có manual P0/P1 bắt buộc cho Phase 02 khi automated verification PASS. PTY wording thật chỉ cần bổ sung fixture nếu sau này gặp signal chưa được parser nhận diện.

## Không làm trong Phase 02

- Renderer mới: Phase 03/04.
- Demand scheduler: Phase 03.
- Full History parser: Phase 08.
- Session Health threshold cố định: chưa chốt ở Phase 02.

## Exit gate

```text
parser/state tests PASS
full cumulative regression PASS
renderer không cần đọc raw rollout trực tiếp
BLOCKER = 0
P0 = 0
required deliverables complete
```

**Phase 02 đã đóng. Có thể bắt đầu Phase 03.**
