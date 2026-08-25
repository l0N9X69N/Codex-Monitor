# Phase 10 — Session Detail Analytics & Live Dynamics

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline, frozen 2026-08-25.

## Spec liên quan

Sections 24–26, 28, 31 và 42.

## Mục tiêu

Hoàn thiện deep-inspection cho một selected session trong Session Manager, dùng cùng semantics cho LIVE và ENDED sessions và thêm analytics/charts dựa trên dữ liệu thật.

## Detail tabs

```text
Info | Tokens | Turns | Tools | Resources | Errors
```

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
- malformed/missing data safe.

## Manual test bắt buộc

- inspect LIVE session while it grows;
- inspect ENDED session;
- verify Context Timeline/Token/Turns/Tools/Errors against real session events;
- ultrawide + narrow;
- low-capability color/chart fallback if environment available;
- idle CPU không tăng do animation loop.

## Deliverables

`docs/qa/phase-10/` chứa đủ 4 handoff files + chart snapshots/fixtures.

## Exit gate

Deep detail correctness + live update + chart semantics PASS, P0=0, no duplicate/memory leak.

## Trạng thái hiện tại

```text
NOT STARTED — old standalone History chart plan superseded
```
