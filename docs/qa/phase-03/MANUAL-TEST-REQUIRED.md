# Phase 03 — Manual Test Required

## P1-01 — PTY responsiveness với scheduler active

Sau khi `phase3-verify.ps1` PASS, chạy:

```powershell
node .\scripts\phase3-pty-load-harness.mjs
```

Harness chạy official Codex dưới PTY như Phase 01 đồng thời bật Central Scheduler với synthetic session/performance/process collectors.

Trong Codex:

1. Gõ nhanh một đoạn prompt dài khoảng 1–2 dòng.
2. Chạy một prompt/tool tạo output tương đối dài nhưng an toàn.
3. Trong lúc output đang chạy, tiếp tục quan sát cảm giác input/terminal.
4. Resize cửa sổ vài lần.
5. Thoát bằng `/exit`.

## PASS

- ký tự gõ không bị trễ thấy rõ do Monitor scheduler;
- Codex output không bị giật/ngắt bất thường do polling;
- resize không crash;
- `/exit` quay lại PowerShell bình thường;
- terminal sau exit vẫn gõ/Enter/Backspace/cursor bình thường;
- harness in thống kê `polls`, `collectorRuns`, `samples` trước khi kết thúc.

## FAIL

Ghi lại nếu có một trong các hiện tượng:

- typing delay rõ ràng chỉ xuất hiện khi dùng harness;
- Codex output bị starvation khi collectors chạy;
- scheduler/timer vẫn giữ process sau `/exit`;
- terminal bị hỏng sau exit.

Nếu FAIL, gửi case ID + mô tả hiện tượng + output stats. Không gửi prompt nhạy cảm hoặc secret.
