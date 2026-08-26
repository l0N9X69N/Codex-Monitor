# Phase 10 — Session Detail Analytics & Live Dynamics

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline.

## Trạng thái

```text
IMPLEMENTATION CHECKPOINT — VERIFICATION PENDING — 2026-08-27
```

Phase 09 Session Manager Dashboard TUI đã được user duyệt và đóng. Phase 10 đang chờ automated + real-session manual gate trước khi CLOSED.

## Mục tiêu

Hoàn thiện deep-inspection cho một selected session trong Session Manager, dùng cùng semantics cho LIVE và ENDED sessions và thêm analytics/charts dựa trên dữ liệu thật.

## Detail tabs

```text
Info | Timeline | Tokens | Turns | Tools | Resources | Errors
```

`Timeline` là audit surface được đưa lên sớm trong Phase 09; Phase 10 giữ nó làm source để cross-check analytics.

### Info

High-value facts + **Context Timeline / Context Stream** hero chart.

### Tokens

- Input/Cached/Uncached/Output/Reasoning/Total;
- current/peak context khi evidence đủ;
- Token I/O per turn;
- Cumulative Tokens.

### Turns

- time/duration/token/context/tool table;
- Turn Duration chart.

### Tools

- aggregate tool counts/share;
- event stream;
- Tool Calls per turn/time chart.

### Resources

Evidence-based inventory only. Không scan filesystem hôm nay để khẳng định resources của historical session.

### Errors

Retry/error/tool-failure/stream-failure/compaction timeline.

## Realtime selected LIVE session

- incremental append only;
- new turn/tool/token/error -> append/update affected model + chart;
- no duplicate;
- no full-file reread loop;
- leaving selected session releases/sleeps detail-only processing.

## Charts

- chart model tách renderer;
- bounded RAM buffers;
- responsive chart sizing;
- Braille -> block -> ASCII fallback;
- same data -> no repaint;
- no fake animation/data.

## Không làm trong Phase 10

- Không historical CPU/RAM/process tree.
- Không pricing/cost.
- Không delete sessions.
- Không generic machine dashboard.

## Auto test bắt buộc

- known series -> known chart bounds/shape;
- compaction marker/context drop;
- turn complete -> duration point;
- token/tool append no duplicate;
- LIVE vs ENDED same semantic model;
- historical resource evidence-only;
- resize/fallback snapshots;
- selected-session-only deep work;
- malformed/missing data safe;
- long-session bounded turn state remains correct after ring pruning.

Commands:

```powershell
npm run test:phase10
npm run verify:phase10
```

## Manual test bắt buộc

- inspect LIVE session while it grows;
- inspect ENDED session;
- verify Context Timeline/Token/Turns/Tools/Errors against real session events;
- ultrawide + narrow;
- low-capability color/chart fallback if environment available;
- idle CPU không tăng do animation loop.

## Deliverables

`docs/qa/phase-10/` chứa đủ 4 handoff files. Test fixtures nằm trong `test/unit/phase10-*.test.js`.

## Exit gate

Deep detail correctness + live update + chart semantics PASS, P0=0, no duplicate/memory leak, user manual acceptance.

## Checkpoint đã triển khai

- selected analytics model từ cùng HistoryEngine event stream;
- context series + compaction markers;
- cumulative tokens + uncached + Token I/O / Turn;
- turn duration + turn evidence table;
- Tool Calls / Turn + tool share + recent tool events;
- error/retry/tool-failure/compaction signals;
- LIVE tail incremental theo file offset;
- selected-detail repaint signature nhỏ, không serialize toàn timeline;
- bounded series/turn/tool/signal buffers;
- Braille/block/ASCII chart fallback;
- malformed/missing evidence regression;
- Phase 09 Timeline/Audit preserved.

Chưa được phép đổi trạng thái thành CLOSED trước khi automated gate và manual real-session gate PASS.
