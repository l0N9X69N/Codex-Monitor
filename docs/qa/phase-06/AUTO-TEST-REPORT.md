# Phase 06 — Auto Test Report

## Trạng thái

**WAITING USER RUN — không được coi là PASS trước khi chạy trên working tree mới nhất.**

## Lệnh chuẩn

```powershell
.\scripts\phase6-verify.ps1
```

Không còn dùng batch `phase6-9-verify.ps1` cho acceptance.

## Script chạy

```text
Syntax
Core correctness smoke
Demand/scheduler/diff regression
Focused Phase 06 passive Live unit/integration tests
```

## Coverage Phase 06

- config schema v2 migration; legacy `tabs` ignored;
- `--manager` Monitor-owned; `--history` không còn Monitor feature;
- wide/full framed visual baseline;
- no old Live navigation chrome;
- API/Login quota isolation;
- responsive cell-width/row-budget invariants;
- system collector demand only when displayed;
- no Performance/Processes continuous demand from dead Live views;
- every stdin byte forwarded unchanged to Codex;
- normal child output zero-extra-repaint fast path;
- destructive VT control -> bounded HUD repair;
- Phase 02 parser + Phase 03 demand/scheduler/diff regressions;
- core auth/activity/freshness/lifecycle smoke.

## PASS condition

```text
Syntax PASS
Core correctness smoke FAIL = 0
Demand/scheduler/diff FAIL = 0
Focused Phase 06 FAIL = 0
```

Windows visual/input/resize/restore manual gate vẫn bắt buộc sau auto PASS.
