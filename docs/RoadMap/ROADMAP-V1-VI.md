# Codex Monitor v1 — Roadmap triển khai chi tiết

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

> **Bổ sung UX đã chốt sau spec:** Live phải hiện đại, gọn, làm nổi bật thông tin cần xem. History giữ tinh thần cyberpunk/hacker/netrunner tương lai nhưng không nhồi tràn lan một màn hình; ưu tiên nhiều panel/biểu đồ có khoảng thở, responsive và chuyển động từ dữ liệu thật.


## Mục đích

`PROJECT-SPEC.md` có Phase A–H ở cấp sản phẩm. Roadmap này **không đổi scope v1**, mà chia thành milestone nhỏ hơn để mỗi phase có thể:

```text
code
→ unit/integration test
→ artifact/test report
→ manual test nếu cần
→ exit gate
→ phase tiếp theo
```

## 12 phase thực thi

| Phase | Tên | Mục tiêu |
|---:|---|---|
| 01 | Correctness & Terminal Safety | Làm Live Monitor đáng tin trước khi mở rộng UI: current-run only, auth đúng, không stale leak, terminal luôn được phục hồi. |
| 02 | Normalized State & Parser Test Harness | Tạo một Normalized Monitor State duy nhất để UI, History và collectors không tự đọc raw event theo cách riêng. |
| 03 | Demand Graph, Central Scheduler & ANSI Diff Renderer | Thực thi 4 luật performance: không dùng thì không collect/poll/repaint; PTY luôn quan trọng hơn telemetry. |
| 04 | Live Monitor UI hiện đại + Responsive + Custom | Xây Live UI v1 gọn, hiện đại, semantic-color rõ, hỗ trợ nhiều lane/cột Custom nhưng luôn giữ đủ không gian cho Codex. |
| 05 | Live UI Fuzz, Snapshot & UX Gate | Không thêm feature lớn; phá Live UI bằng automation và manual UX review trước khi mở rộng views. |
| 06 | Live Views & Lazy Collectors | Hoàn thiện 6 Live views mà vẫn demand-driven. |
| 07 | Platform Adapters: Windows / Linux / macOS | Giữ semantics/UI/config chung, cô lập OS-specific behavior sau Platform Adapter. |
| 08 | History Core Engine | Xây data engine cho `codexm --history`: local JSONL, RAM index, lazy parse, live-tail, không DB. |
| 09 | History Cyberpunk / Netrunner TUI | Xây full-screen History TUI có cảm giác tương lai/hacker/netrunner, nhưng thoáng, readable và không nhồi mọi analytics lên cùng một màn hình. |
| 10 | History Charts & Live Dynamics | Thêm 5 chart + event timeline; History trông sống động nhờ data thật. |
| 11 | History Storage, Delete Safety & History QA | Hoàn thiện storage/delete và stress-test History trước productization. |
| 12 | Productization, Full QA, Packaging & Release Candidate | Không thêm feature lớn; harden toàn bộ sản phẩm thành Release Candidate có thể public. |

## Dependency

```text
P01 Correctness
 ↓
P02 State/Parsers
 ↓
P03 Demand/Scheduler/Diff renderer
 ↓
P04 Live UI + Responsive + Custom
 ↓
P05 Live UI Fuzz/UX Gate
 ↓
P06 Live Views + Lazy Collectors
 ↓
P07 Platform Adapters
 ↓
P08 History Core
 ↓
P09 History Cyberpunk TUI
 ↓
P10 History Charts
 ↓
P11 History Storage + QA
 ↓
P12 Productization + Release
```

## Ánh xạ với Phase A–H trong PROJECT-SPEC

```text
Spec A -> P01 + P02
Spec B -> P03
Spec D -> P04 + P05 + P06
Spec C -> P07
Spec E -> P08
Spec F -> P09 + P10
Spec G -> P11
Spec H -> P12
```

Security/privacy, terminal safety, performance và test là concern xuyên suốt; không đợi P12 mới kiểm tra.

## Chốt visual

### Live Monitor

- Modern professional terminal UI.
- Gọn theo chiều cao; tận dụng chiều ngang/multiple lanes.
- Primary info nổi bật bằng semantic color.
- Custom mạnh nhưng user chỉ chọn **thông tin**, layout engine chọn **cột/lane/width/density**.
- Không word-wrap telemetry.
- Full/Compact/Custom cùng semantics.
- Login quota 5H/WEEK phải dễ nhìn; API không có quota Login.

### History Viewer

- Full-screen TUI, cyberpunk/hacker/netrunner tương lai.
- Không nhồi mọi dữ liệu lên cùng màn hình.
- Chia panel/table/chart/detail tabs có khoảng thở.
- Màn ultrawide có thể bung thành control-room dashboard.
- Neon có hierarchy, không rainbow.
- Chỉ động khi source data thật thay đổi; không decorative 30/60 FPS.

## Quy ước test

Xem:

```text
00-QUY-UOC-TEST-VA-BAN-GIAO.md
```

Mỗi phase có file riêng trong thư mục này.

## Quy tắc thay đổi roadmap

Nếu sau này đổi sản phẩm:

1. Ghi amendment vào source-of-truth.
2. Xác định phase bị ảnh hưởng.
3. Update roadmap + phase docs.
4. Không âm thầm đổi semantics.
