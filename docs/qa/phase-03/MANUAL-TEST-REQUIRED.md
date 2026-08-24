# Phase 03 — Manual Test Required

## Trạng thái

**P1-01 PASS — user confirmed PTY responsiveness harness passed.**

## P1-01 — PTY responsiveness với scheduler active

Sau automated PASS, user chạy:

```powershell
node .\scripts\phase3-pty-load-harness.mjs
```

Manual acceptance đã xác nhận:

- ký tự gõ không bị trễ thấy rõ do Monitor scheduler;
- Codex output không bị giật/ngắt bất thường do polling;
- resize không crash;
- `/exit` quay lại PowerShell bình thường;
- terminal sau exit vẫn bình thường;
- scheduler/harness không giữ process sau khi Codex thoát.

**Kết quả: PASS.**

Không còn manual P0/P1 bắt buộc cho Phase 03.
