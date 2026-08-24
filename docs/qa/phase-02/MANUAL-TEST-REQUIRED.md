# Phase 02 — Manual Test Required

## Trạng thái

Không có manual P0/P1 bắt buộc nếu automated verification PASS.

Phase 02 chủ yếu là parser/state semantics và đã được thiết kế để auto-test bằng fixtures.

## Chỉ cần manual khi gặp wording PTY thật chưa có fixture

Nếu official Codex hiện một signal mà parser PTY không nhận đúng, ví dụ:

- approval prompt;
- cancel/deny;
- tool error;
- retry/reconnect;
- compaction wording đặc biệt;

hãy gửi lại **chỉ phần text đã loại secret** và mô tả trạng thái mong đợi.

Không gửi API key, access token, prompt nhạy cảm hoặc nội dung secret.

## Cách xác nhận Phase 02

```powershell
.\scripts\phase2-verify.ps1
```

Nếu output kết thúc bằng:

```text
Phase 02 automated verification: PASS
AUTO TEST: PASS
```

thì không cần manual test bổ sung cho Phase 02.
