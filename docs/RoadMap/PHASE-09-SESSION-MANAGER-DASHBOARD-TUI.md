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

Quyết định visual/view mode được freeze tại `docs/decisions/phase9-manager-view-modes.md`.

Manager có bốn presentation mode trên cùng data/core:

```text
Operations
Table
Charts
Auto
```

- **Operations**: balanced default direction; LIVE + context/events + token activity + selected preview + session table.
- **Table**: power-user/index view; table là surface chính, framing nhẹ, chart secondary/omitted.
- **Charts**: visual control-room; boxed cards mạnh hơn, primary charts rõ ràng.
- **Auto**: responsive policy; narrow ưu tiên Table, normal/wide Operations, ultrawide có thể dùng Charts.

Box hierarchy:

```text
normal panel   ┌ ─ ┐
focused panel  ╔ ═ ╗
```

Charts mode box-heavy; Operations dùng ít khung lớn; Table box-light. Không biến UI thành box soup.

## Dashboard mặc định

Phải trả lời nhanh:

- bao nhiêu session đang LIVE;
- session nào context pressure cao nhất;
- token/tool activity có đang cao không;
- session nào có error/retry gần đây;
- local sessions nào tồn tại và lớn bao nhiêu.

Primary information set:

```text
Live Sessions summary
Token Activity
Context Pressure
Tool Activity
Session Events summary
Storage summary
Selected preview
Session table
```

Không phải view nào cũng hiện toàn bộ các area cùng lúc. Default visible primary charts phải bounded. Terminal rộng thì mở rộng panel hiện có trước, không nhồi chart chỉ vì còn chỗ.

Phase 09 chart dùng cross-section từ evidence thật hiện có của từng session. Không dựng historical time-series point giả khi Phase 08 chưa có global historical sample ring.

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

Global table/search/filter/sort dùng lightweight/indexed rows; không deep-parse toàn bộ history.

## Selected preview / inspect

Moving row phải có visible selection. Operations/Charts view nên có selected preview khi đủ không gian.

`Enter` không được tạo hidden state. Phase 09 có thể show exact-session inspect summary cơ bản; full analytics/timeline sâu thuộc Phase 10.

Deep parse vẫn selected-session-only.

## Navigation

Manager được quyền sở hữu keyboard/mouse vì độc lập với Codex input.

Current key direction:

```text
↑/↓          move session
Enter        inspect
/            search
F            filter/scope
S            sort field
D            sort direction
V            change view mode
Tab/←/→      move applicable panels/tabs
Q/Esc        back/quit
mouse wheel  move table when supported
```

Exact keymap phải được document + test, nhưng không có collision với Live Codex.

Intended product UX after visual acceptance:

```text
first Manager use -> choose default view
later launches     -> remember default
V                  -> change view any time
```

Persistence/onboarding được sequenced sau khi visual layouts được user duyệt.

## Responsive

- narrow: stack theo priority, chart lớn có thể bị bỏ;
- normal: operations/table priority;
- wide: operations dashboard + table;
- ultrawide: control-room layout nhưng vẫn thoáng;
- no wrap/overflow;
- Unicode cell width;
- TRUECOLOR -> 256 -> 16 -> MONO fallback.

## Realtime

- lightweight LIVE session state update từ Phase 08;
- changed data -> affected panel repaint;
- no global fixed FPS;
- optional subtle LIVE pulse chỉ nếu cực nhẹ và theme cho phép;
- no fake historical chart points.

## Checkpoints đã triển khai

### Checkpoint 1 — dashboard model + renderer

- `src/manager/dashboard-model.js` — summary/query/sort/selection/chart projection từ Phase 08 rows;
- responsive pure renderer;
- primary chart projection Token Activity / Context Pressure / Tool Activity;
- responsive session table columns;
- empty/unmatched state safe.

### Checkpoint 2 — interactive runtime

- `codexm --manager` full-screen alternate-screen TUI;
- keyboard/search/filter/sort/focus navigation;
- changed-evidence repaint signature;
- terminal cleanup/restore;
- unknown input crash regression fixed.

### Checkpoint 3 — accepted visual modes, in verification

- Operations/Table/Charts/Auto renderer modes;
- `V` runtime view cycling;
- boxed visual hierarchy per mode;
- selected lightweight preview in Operations/Charts;
- Auto geometry resolution;
- no change to Phase 08 collection/deep-parse policy.

## Không làm trong Phase 09

- Chưa full selected-session analytics charts; Phase 10.
- Chưa destructive delete; Phase 11.
- Không generic process/network/GPU dashboard.
- Không pricing/cost.

## Auto test bắt buộc

- dashboard model from known multi-session fixtures;
- live/ended/search/filter/sort table behavior;
- Operations/Table/Charts/Auto layout behavior;
- no-wrap/layout snapshots narrow/normal/wide/ultrawide;
- active selection visible;
- color capability fallback giữ semantics;
- keyboard/mouse normalization;
- changed-data only repaint;
- empty/no-session/malformed-session states safe.

## Manual test bắt buộc

- 2–3 Live Codex sessions + ended sessions;
- normal + ultrawide + narrow terminal;
- Operations/Table/Charts/Auto hierarchy/readability;
- search/filter/sort/navigation;
- selected preview dễ hiểu;
- realtime updates không lag/flicker;
- exit restore terminal sạch;
- user duyệt visual direction.

## Deliverables

`docs/qa/phase-09/` chứa đủ 4 handoff files + dashboard snapshots/gallery.

## Exit gate

Manager dashboard usable/readable, multi-LIVE correct, responsive gate xanh, BLOCKER=0, P0=0, user duyệt visual direction.
