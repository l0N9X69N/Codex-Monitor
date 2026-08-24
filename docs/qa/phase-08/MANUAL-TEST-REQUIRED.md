# Phase 08 — Manual Test Required

Sau combined auto PASS:

```powershell
node .\src\cli\codexm.js --history
```

## P0-01 — Không spawn Codex

Mở History khi không cần tạo Live Codex mới.

**PASS:** chỉ History TUI chạy; không xuất hiện Codex prompt/process mới do `--history`.

## P1-02 — Folder session thật lớn

Dùng thư mục Codex sessions hiện có.

**PASS:** màn hình lên nhanh theo metadata; chỉ selected session được deep parse, không tạo DB/CSV.

## P1-03 — Live-tail

Trong một terminal để Codex session đang chạy/grow; terminal History chọn session đó và nhấn `T`.

**PASS:** event mới xuất hiện incremental, không duplicate và không reread gây đứng UI rõ rệt.

## P0-04 — Historical truth

Kiểm tra session cũ có missing data/resource.

**PASS:** missing = `--`; không lấy config/resources hiện tại để gán ngược cho session cũ.
