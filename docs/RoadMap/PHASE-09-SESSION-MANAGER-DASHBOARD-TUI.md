# Phase 09 — Session Manager Dashboard TUI

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline.

## Trạng thái

```text
CLOSED — USER ACCEPTED — 2026-08-27
```

Phase 08 Session Manager Core đã CLOSED. Phase 09 Dashboard TUI đã qua nhiều vòng manual visual/UX review và được user chốt đóng. Từ đây chỉ correctness/integration regression được sửa trong Phase 09; analytics mới thuộc Phase 10.

## Mục tiêu đã đạt

Xây full-screen `codexm --manager` TUI độc lập với Codex input, dùng core Phase 08, có multi-session dashboard responsive và selected-session inspect rõ ràng.

## Presentation modes

```text
Operations
Table
Charts
Auto
```

- **Operations**: LIVE/current state + rolling telemetry + selected session + recent sessions.
- **Table**: session index là primary control surface.
- **Charts**: multi-session telemetry/control-room view.
- **Auto**: geometry-driven presentation policy.

## Dashboard / telemetry đã chốt

- LIVE session summary;
- token burn rolling telemetry;
- raw tool load;
- turn turnaround evidence;
- per-LIVE burn/share/context/tools/turn/agent evidence;
- token/context rankings from real evidence;
- storage/session event summary;
- selected-session preview;
- adaptive session table.

Không fake historical point. Unknown evidence hiển thị `--`/`UNKNOWN` thay vì suy diễn.

## Session table

Support:

```text
All / Live / Ended
Search
Sort
Select row
```

Responsive field pool hiện gồm các field evidence-backed như:

```text
STATE PROJECT SESSION MODEL EFFORT ACTIVE CONTEXT
INPUT CACHE OUTPUT REASON TURN LAST TURN TOOLS AGENTS SIZE CWD
```

Màn hẹp bỏ field phụ trước; màn rộng/ultrawide tận dụng thêm field thật thay vì kéo một cột vô nghĩa.

## Selected Activity preview

Ultrawide có sidecar `SELECTED ACTIVITY` cho row đang highlight.

Rules:

- bounded tail/backfill;
- chỉ selected row;
- local time;
- incremental append khi file tăng;
- target event count theo số row pane nhìn thấy;
- terminal thấp co Activity trước, session table giữ priority;
- `Enter` mới deep-load selected session đầy đủ.

## Inspect / Timeline

`Enter` mở exact selected-session Inspect.

Tabs:

```text
Info | Timeline | Tokens | Turns | Tools | Resources | Errors
```

Timeline/Audit được đưa lên trong Phase 09 vì là chức năng inspect cốt lõi:

- user/assistant/turn/tool/result/error/compaction evidence;
- sanitized command/path/input/output khi JSONL có evidence;
- tool call/result pairing bằng call id;
- scroll/PgUp/PgDn/Home/End;
- filter/search;
- event detail;
- local timestamps;
- không đưa token-usage noise vào audit stream mặc định.

Phase 10 nâng các tab detail thành analytics/charts; không xây lại Timeline.

## Performance architecture

```text
COLD      indexed metadata, cold sweep
RECENT    bounded fast refresh
LIVE      fast refresh + lightweight telemetry
SELECTED  deep parse/tail only
```

- discovery không stat lại toàn bộ known history mỗi 5s;
- cold history không hydrate summary hàng loạt;
- selected Activity chỉ đọc bounded suffix;
- selected deep model được release khi rời selection;
- repaint dựa trên changed evidence, không fixed animation FPS.

## Responsive / terminal laws

- terminal cells/rows, không dựa physical screen size;
- narrow/normal/wide/ultrawide;
- table priority on short terminals;
- no wrap/overflow;
- Unicode cell width;
- TRUECOLOR -> 256 -> 16 -> MONO semantic fallback;
- terminal/input restore sạch khi quit.

## Không làm trong Phase 09

- selected-session analytics charts: Phase 10;
- destructive delete/storage management: Phase 11;
- generic process/network/GPU dashboard;
- pricing/cost.

## Verification / handoff

Automated Phase 09 gate:

```powershell
npm run test:phase9
```

Handoff files: `docs/qa/phase-09/`.

## Exit gate

```text
PASS by product/user decision:
- Manager usable/readable
- multi-LIVE correct enough for Phase 09 scope
- responsive layouts manually accepted
- Timeline/Audit inspect accepted
- BLOCKER=0 / no known P0 in accepted scope
```

Phase 09 is CLOSED. New feature work moves to Phase 10+ unless it reveals a Phase 09 correctness regression.
