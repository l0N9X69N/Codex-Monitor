# Phase 09 — Session Manager Dashboard TUI

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline.

## Trạng thái

```text
ACTIVE — 2026-08-26
```

Phase 08 Session Manager Core đã CLOSED. Old History TUI chỉ là scaffold/regression material, không được tính là Phase 09 completion.

## Mục tiêu

Xây full-screen `codexm --manager` TUI theo hướng futuristic local operations console, dùng core Phase 08, có multi-session dashboard rõ ràng và responsive.

## Visual direction

Manager phải có cảm giác cyberpunk/hacker-futuristic nhưng vẫn professional/readable:

- dark terminal;
- cyan/green/purple/gold semantic highlights;
- restrained neon borders;
- generous spacing;
- ít panel có giá trị thay vì telemetry wall;
- chart lớn, dễ đọc;
- movement chỉ từ data thật.

## Dashboard mặc định

Phải trả lời nhanh:

- bao nhiêu session đang LIVE;
- session nào context pressure cao nhất;
- token/tool activity có đang cao không;
- session nào có error/retry gần đây;
- local sessions nào tồn tại và lớn bao nhiêu.

Primary areas:

```text
Live Sessions summary
Token Activity chart
Context Pressure chart
Tool Activity chart
Session Events summary
Storage summary
Session table
```

Default tối đa khoảng 3 primary charts. Terminal rộng thì mở rộng chart/panel hiện có, không nhồi thêm chart chỉ vì còn chỗ.

Phase 09 checkpoint 1 dùng cross-section chart từ evidence thật hiện có của từng session. Không dựng historical time-series point giả khi Phase 08 chưa có global historical sample ring.

## Session table

Support:

```text
All / Live / Ended
Search
Filter
Sort
Select row
```

Columns responsive từ tập:

```text
STATE PROJECT MODEL DURATION CONTEXT INPUT CACHE TURN TOOLS SIZE
```

## Navigation

Manager được quyền sở hữu keyboard/mouse vì độc lập với Codex input.

Minimum:

```text
↑/↓          move session
Enter        inspect
/            search
F            filter
Tab/←/→      move applicable panels/tabs
Q/Esc        back/quit
mouse        optional when supported
```

Exact keymap phải được document + test, nhưng không có collision với Live Codex.

## Responsive

- narrow: stack summary/table/charts theo priority;
- normal: 2-area/dashboard + table;
- wide: 3 primary charts + table;
- ultrawide: control-room layout nhiều panel nhưng vẫn thoáng;
- no wrap/overflow;
- Unicode cell width;
- TRUECOLOR -> 256 -> 16 -> MONO fallback.

## Realtime

- lightweight LIVE session state update từ Phase 08;
- changed data -> affected panel repaint;
- no global fixed FPS;
- optional subtle LIVE pulse chỉ nếu cực nhẹ và theme cho phép;
- no fake historical chart points.

## Checkpoint 1 — dashboard model + renderer

Đã triển khai:

- `src/manager/dashboard-model.js` — summary/query/sort/selection/chart projection từ Phase 08 rows;
- `src/manager/dashboard-render.js` — renderer pure, không file/process I/O;
- responsive breakpoints narrow/normal/wide/ultrawide;
- primary chart projection Token Activity / Context Pressure / Tool Activity;
- responsive session table columns;
- empty/unmatched state safe;
- `test/unit/phase9-dashboard.test.js`;
- `npm run verify:phase9` gate.

Checkpoint 1 chưa nối interactive Manager runtime; đó là checkpoint kế tiếp sau local verify.

## Không làm trong Phase 09

- Chưa full selected-session analytics charts; Phase 10.
- Chưa destructive delete; Phase 11.
- Không generic process/network/GPU dashboard.
- Không pricing/cost.

## Auto test bắt buộc

- dashboard model from known multi-session fixtures;
- live/ended/search/filter/sort table behavior;
- no-wrap/layout snapshots narrow/normal/wide/ultrawide;
- active selection visible;
- color capability fallback giữ semantics;
- keyboard/mouse normalization;
- changed-data only repaint;
- empty/no-session/malformed-session states safe.

## Manual test bắt buộc

- 2–3 Live Codex sessions + ended sessions;
- normal + ultrawide + narrow terminal;
- dashboard hierarchy/readability;
- search/filter/sort/navigation;
- realtime updates không lag/flicker;
- exit restore terminal sạch.

## Deliverables

`docs/qa/phase-09/` chứa đủ 4 handoff files + dashboard snapshots/gallery.

## Exit gate

Manager dashboard usable/readable, multi-LIVE correct, responsive gate xanh, BLOCKER=0, P0=0, user duyệt visual direction.
