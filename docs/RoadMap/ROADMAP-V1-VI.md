# Codex Monitor v1 — Roadmap triển khai chi tiết

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline, frozen 2026-08-25. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

## Mục đích

Roadmap chia implementation thành các gate nhỏ, tuần tự:

```text
code
→ unit/integration/snapshot/fuzz
→ handoff docs
→ manual test nếu cần
→ exit gate
→ phase tiếp theo
```

Không gộp Phase 06–09 thành một batch acceptance nữa. Từ Phase 06 trở đi phải đóng từng phase riêng rồi mới tăng phase.

## 12 phase thực thi

| Phase | Tên | Mục tiêu |
|---:|---|---|
| 01 | Correctness & Terminal Safety | Current-run only, auth đúng, terminal restore an toàn. |
| 02 | Normalized State & Parser Test Harness | Một normalized state/provenance/freshness model duy nhất. |
| 03 | Demand Graph, Central Scheduler & ANSI Diff Renderer | Không demand thì không collect/poll/repaint; PTY ưu tiên cao nhất. |
| 04 | Live Monitor UI + Responsive + Custom | Responsive HUD foundation, presets/themes/custom. |
| 05 | Live UI Fuzz, Snapshot & UX Gate | Layout fuzz/snapshot/UX safety gate. |
| 06 | Passive Live HUD Completion & v1 Visual Baseline | Chốt Live thành single passive HUD, bỏ navigation/hotkeys/History hook, migrate config, phục hồi visual tối thiểu bằng v1 trước refactor. |
| 07 | Platform Adapters: Windows / Linux / macOS | Cô lập PTY/process/system/disk/path/restore theo OS; không History launcher. |
| 08 | Session Manager Core | `codexm --manager`, discover/classify/tail nhiều LIVE+ENDED sessions, RAM index, selected-session deep parser. |
| 09 | Session Manager Dashboard TUI | Cyber/professional multi-session dashboard, session table, search/filter/sort, 3 primary global charts. |
| 10 | Session Detail Analytics & Live Dynamics | Info/Tokens/Turns/Tools/Resources/Errors + Context Timeline và detail charts. |
| 11 | Session Storage, Delete Safety & Manager QA | Storage summary, safe selection/delete, LIVE protection, stress QA. |
| 12 | Productization, Full QA, Packaging & Release Candidate | CLI/config/updater/security/install/release/cross-platform hardening. |

## Dependency

```text
P01 Correctness
 ↓
P02 State/Parsers
 ↓
P03 Demand/Scheduler/Diff
 ↓
P04 Live UI Foundation
 ↓
P05 Live Fuzz/UX Gate
 ↓
P06 Passive Live Completion + v1 Visual Floor
 ↓
P07 Platform Adapters
 ↓
P08 Session Manager Core
 ↓
P09 Manager Dashboard TUI
 ↓
P10 Session Detail Analytics
 ↓
P11 Storage/Delete Safety + Manager QA
 ↓
P12 Productization + Release
```

## Change-control note cho Phase 01–05

Phase 01–05 là historical implementation records đã đóng trước product baseline 2026-08-25. Những behavior cũ như Live interactive tabs/F4/Monitor hotkeys đã bị `PROJECT-SPEC.md` mới supersede và được loại ở Phase 06. Không cần chạy lại toàn bộ Phase 01–05 như phase mới, nhưng regression test liên quan phải được migration để phản ánh product contract hiện tại.

## Visual contract

### Live Monitor

Live là **display-only HUD**. Official Codex sở hữu toàn bộ keyboard input.

Visual floor từ Phase 06:

- ít nhất bằng chất lượng giao diện v1 trước refactor ở wide/full;
- outer frame/panel hierarchy rõ;
- `CONTEXT`, `USAGE`, `SESSION`, `CURRENT ACTIVITY` nhìn ra ngay;
- semantic colors, bars, spacing/padding;
- gọn chiều cao và responsive;
- narrow có thể giảm chrome/detail nhưng không wrap/overflow;
- sau khi floor ổn mới polish đẹp hơn, không hy sinh correctness/input latency.

Không còn Live tabs/navigation/F4 History.

### Session Manager

Canonical command:

```powershell
codexm --manager
```

Manager là interactive analytics/dashboard TUI duy nhất:

- multi-LIVE + ENDED sessions;
- session table/search/filter/sort;
- global Token Activity / Context Pressure / Tool Activity;
- selected-session detail analytics;
- storage/delete ended sessions;
- cyberpunk/hacker-futuristic nhưng thoáng/readable;
- data-driven motion, không fake fixed-FPS animation.

Không có public standalone `--history` feature trong v1.

## Cross-platform policy

Windows/Linux/macOS dùng cùng semantics/UI model. OS-specific behavior ở Platform Adapter. Platform chưa có môi trường thật phải ghi `UNVERIFIED PLATFORM`, không được giả PASS.

## Quy ước test

Xem `00-QUY-UOC-TEST-VA-BAN-GIAO.md`.

Mỗi phase có:

```text
PHASE-N-RESULT.md
AUTO-TEST-REPORT.md
MANUAL-TEST-REQUIRED.md
KNOWN-ISSUES.md
```

## Quy tắc thay đổi roadmap

Nếu product semantics đổi:

1. update `PROJECT-SPEC.md` hoặc explicit amendment;
2. xác định phases bị ảnh hưởng;
3. update roadmap + phase docs trước implementation tiếp;
4. không âm thầm đổi behavior chỉ trong code/chat.
