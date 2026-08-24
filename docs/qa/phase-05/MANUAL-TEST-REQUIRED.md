# Phase 05 — Manual Test Required

Phase 05 không thêm view lớn mới. Manual gate dùng để chốt Live visual sau fuzz/snapshot automation.

## P1-01 — Canonical demo matrix

Sau khi `phase5-verify.ps1` PASS, chạy:

```powershell
npm run demo:phase5
```

Script in 8 layout đại diện:

```text
36x18   narrow Login
60x24   normal Login
90x24   two-lane Login
120x35  wide Login
160x35  ultrawide Full
120x35  API wide
120x35  Matrix wide
72x24   Mono Compact
```

### PASS

- narrow vẫn đọc được Activity/navigation, không wrap;
- normal không cao quá mức;
- wide/ultrawide dùng thêm lane thay vì kéo dài vô ích;
- Activity dễ nhận ra trước secondary labels;
- Context/quota dễ scan khi có chỗ;
- API không có Login 5H/WEEK;
- Matrix/Mono giữ cùng semantics.

## P1-02 — Resize threshold jitter trên Live thật

Chạy:

```powershell
node .\src\cli\codexm.js
```

Kéo width chậm qua lại quanh điểm đổi 1/2/3 lane, sau đó kéo nhanh narrow -> wide -> narrow -> wide.

### PASS

- layout không nhảy qua lại liên tục chỉ vì +/- 1–3 terminal cells;
- không chồng prompt;
- không để lại HUD cũ;
- Codex typing/output vẫn phản hồi bình thường.

## P1-03 — Custom stress visual

Chạy:

```powershell
node .\src\cli\codexm.js --configure
```

Nghiệm thu ít nhất hai Custom:

1. rất ít nội dung: Activity + Context, ít tabs;
2. nhiều nội dung: 4 header items + nhiều tabs + hầu hết Overview sections/metrics.

Sau mỗi cấu hình, chạy:

```powershell
node .\src\cli\codexm.js --demo
```

### PASS

- user chỉ chọn nội dung, không cần chọn columns/width;
- layout tự co/stack/hide hợp lý;
- không biến thành telemetry wall.

## Direction acceptance bắt buộc

User xác nhận 4 điểm:

- Live dễ đọc;
- Monitor không quá cao;
- primary metric nổi bật hơn secondary labels;
- Custom vẫn nhìn hợp lý.

Nếu FAIL, gửi case ID + kích thước terminal gần đúng + output/ảnh nếu có. Không gửi secret hoặc prompt nhạy cảm.
