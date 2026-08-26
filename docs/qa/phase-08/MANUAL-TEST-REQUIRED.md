# Phase 08 — Manual Test Required

Automated gate đã PASS. Manual gate cuối dùng public Manager semantics:

```powershell
node .\src\cli\codexm.js --manager
```

## P0-01 — Manager không spawn Codex

Mở Manager khi chưa chạy Codex mới.

**PASS:** không xuất hiện Codex prompt/process mới do Manager tạo.

## P0-02 — 2–3 session LIVE độc lập

Mở 2–3 Codex terminals thật ở các project/session khác nhau, tạo activity ở từng terminal rồi quan sát Manager.

**PASS:** từng session được phát hiện độc lập; session có strong evidence/growth chuyển LIVE; không dùng activity của session A để claim session B LIVE.

## P0-03 — LIVE → ENDED/UNKNOWN an toàn

Đóng một Codex terminal trong khi các terminal khác vẫn chạy.

**PASS:** session vừa đóng không tiếp tục bị claim LIVE vô hạn; các session còn chạy không bị ảnh hưởng. Nếu process/session evidence chưa đủ mạnh, UNKNOWN được chấp nhận thay vì fabricate ENDED/LIVE.

## P1-04 — Folder session thật lớn

Dùng thư mục Codex sessions hiện có, ưu tiên máy có nhiều rollout.

**PASS:** Manager mở và poll ổn; startup không full-read/deep-parse toàn bộ history; không tạo DB/CSV.

## P1-05 — Selected detail / non-selected lightweight

Chọn một session để deep detail, tạo thêm activity rồi quan sát update. Sau đó bỏ chọn hoặc chuyển sang session khác.

**PASS:** selected detail cập nhật incremental; deep cache cũ được nhả khi đổi/bỏ selection; non-selected sessions chỉ dùng lightweight tracking, không gây CPU/I/O cao rõ rệt.

## P1-06 — Historical truth

Kiểm tra session cũ có missing data/resource và lightweight row chưa có exact totals.

**PASS:** missing giữ `--`/unknown; incomplete turn/tool total không bị fabricate; không lấy system/resource hiện tại để gán ngược cho history.

## Báo kết quả

Chỉ cần báo ngắn theo mẫu:

```text
P0-01 PASS
P0-02 PASS
P0-03 PASS
P1-04 PASS
P1-05 PASS
P1-06 PASS
```

Nếu một mục FAIL, kèm hiện tượng nhìn thấy và lệnh/terminal nào đang chạy. Phase 08 chỉ CLOSED khi P0 = 0 và manual gate không còn blocker.
