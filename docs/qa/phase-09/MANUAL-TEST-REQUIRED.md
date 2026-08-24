# Phase 09 — Manual Test Required

Sau combined auto PASS:

```powershell
npm run demo:history
node .\src\cli\codexm.js --history
```

## P1-01 — Visual direction

Test terminal normal và ultrawide.

**PASS:** có cảm giác control-room/cyberpunk nhưng vẫn readable; active area nổi bật; panel có khoảng thở; không thành telemetry wall.

## P1-02 — Responsive

Resize hẹp/rộng/cao/thấp.

**PASS:** normal stack panel hợp lý; ultrawide mở side-by-side; không wrap/overflow rõ rệt.

## P0-03 — Navigation/restore

- ↑↓ session / mouse wheel;
- ←→ Info/Tokens/Turns/Tools/Resources/Errors;
- `S` Storage, `R` refresh, `T` live-tail;
- `Q` hoặc Esc exit.

**PASS:** terminal trở lại PowerShell sạch, cursor/raw/mouse/alternate-screen restore đầy đủ.

## P0-04 — Storage safety

**PASS:** Phase 09 Storage chỉ đọc thống kê; không có delete/archive mutation trước Phase 11.
