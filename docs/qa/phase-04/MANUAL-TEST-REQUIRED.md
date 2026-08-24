# Phase 04 — Manual Test Required

Phase 04 cần user nghiệm thu direction Live UI sau khi automated verification PASS.

## P1-01 — Demo responsive ở nhiều kích thước

Resize Windows Terminal trước mỗi lần chạy:

```powershell
node .\src\cli\codexm.js --demo
node .\src\cli\codexm.js --demo-state tool
node .\src\cli\codexm.js --demo-state approval
node .\src\cli\codexm.js --demo-state error
```

Kiểm tra ít nhất:

- cửa sổ nhỏ;
- kích thước bình thường;
- ultrawide.

**PASS:** không telemetry wrap/overflow; monitor giảm hàng khi terminal thấp; width rộng tạo layout thoáng hơn thay vì chỉ kéo dài một cột.

## P1-02 — Themes và presets

```powershell
node .\src\cli\codexm.js --demo --preset compact --theme color
node .\src\cli\codexm.js --demo --preset full --theme mono
node .\src\cli\codexm.js --demo --preset full --theme matrix
```

**PASS:** semantics không đổi; Color dễ scan, Mono đọc được không phụ thuộc màu, Matrix là green aesthetic nhưng không làm mất hierarchy.

## P0-03 — Login/API quota isolation UI

```powershell
node .\src\cli\codexm.js --demo --auth login
node .\src\cli\codexm.js --demo --auth api
```

**PASS:** Login có 5H/WEEK; API tuyệt đối không hiện Login quota.

## P1-04 — Live thật + resize nhanh

```powershell
node .\src\cli\codexm.js
```

Trong official Codex:

1. nhập prompt ngắn;
2. resize nhanh hẹp/rộng/cao/thấp 10–15 giây;
3. chạy một tool/output vừa phải;
4. `/exit`.

**PASS:** Codex không crash; HUD không chồng/wrap vào prompt rõ rệt; resize không nhấp nháy layout liên tục; typing vẫn phản hồi; `/exit` về PowerShell sạch và HUD được clear.

## P1-05 — Tiếng Việt / Unicode

Dùng path/project hoặc demo có ký tự tiếng Việt/Unicode. Nếu terminal/font không render flag ổn định thì UI dùng text fallback, không phụ thuộc flag.

**PASS:** alignment vẫn đúng theo terminal cells, không cắt escape sequence hoặc vỡ hàng.

## P1-06 — Custom ít/nhiều metric + header/tabs

Chạy:

```powershell
node .\src\cli\codexm.js --configure
```

Tạo một Custom rất ít metric và một Custom nhiều metric/header 4 item/nhiều tabs; dùng `--demo` để xem lại.

**PASS:** user chỉ chọn nội dung; không phải cấu hình số cột/width; layout tự co/stack/hide optional hợp lý.

## Direction acceptance

User xác nhận thêm 3 điểm chủ quan nhưng bắt buộc:

- Live nhìn gọn và hiện đại;
- dữ liệu chính nổi bật, không rainbow/noisy;
- phần Monitor không chiếm quá nhiều chiều cao của Codex.

Nếu FAIL, gửi case ID + kích thước terminal gần đúng + ảnh/video nếu lỗi visual. Không gửi secret/prompt nhạy cảm.
