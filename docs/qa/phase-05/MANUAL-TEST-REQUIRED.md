# Phase 05 — Manual Test Required

## Trạng thái

**PASS — user accepted Phase 05 visual/resize behavior on Windows Terminal after the HUD overlap fix.**

## P1-01 — Canonical demo matrix

Đã chạy:

```powershell
npm run demo:phase5
```

8 layout đại diện đã được review:

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

### Kết quả

**PASS**

- narrow vẫn đọc được Activity/navigation;
- normal không quá cao;
- wide/ultrawide tận dụng thêm lane;
- Activity/Context/quota vẫn giữ hierarchy;
- API không có Login 5H/WEEK;
- Matrix/Mono giữ cùng semantics;
- unknown System RAM hiển thị `--`, không giả thành `0`.

## P1-02 — Resize threshold jitter trên Live thật

Đã chạy Live thật và resize narrow/wide.

Một lỗi được phát hiện trong manual test: HUD có thể đè prompt. Lỗi này đã được sửa bằng terminal scroll-region isolation cho child Codex viewport; scroll region được cập nhật khi resize và restore khi exit.

User retest sau fix và xác nhận **PASS**:

- HUD không còn đè prompt;
- resize không gây layout jitter bất thường;
- không để lại HUD cũ đáng kể;
- typing/output vẫn phản hồi bình thường;
- exit trả terminal sạch.

## P1-03 — Custom stress visual

Custom/preset/layout direction đã được chấp nhận trong Phase 04 và tiếp tục không phát hiện regression trong canonical Phase 05 matrix/fuzz gate.

### Kết quả

**PASS**

- user chọn nội dung, không chọn columns/width;
- layout tự co/stack/hide;
- không phát hiện telemetry wall blocker trong gate hiện tại.

## Direction acceptance

User xác nhận direction hiện tại đạt yêu cầu:

- Live dễ đọc;
- Monitor không quá cao;
- primary metric nổi bật hơn secondary labels;
- responsive/custom direction hợp lý;
- HUD/prompt isolation đã hoạt động sau fix.

**Manual gate Phase 05: PASS.**
