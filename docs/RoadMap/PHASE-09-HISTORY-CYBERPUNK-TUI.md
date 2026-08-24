# Phase 09 — History Cyberpunk / Netrunner TUI

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor Final Project Specification v1, design freeze 2026-08-24.

## Mục tiêu

Full-screen History TUI futuristic/hacker/netrunner nhưng thoáng, readable, responsive.

## Implementation

- Alternate-screen TUI + safe restore.
- Semantic neon theme with truecolor -> 256 -> 16 -> mono fallback.
- Sessions table + selected detail.
- Info/Tokens/Turns/Tools/Resources/Errors navigation.
- Read-only Storage entry point; mutation giữ cho Phase 11.
- Normal stacked layout; ultrawide side-by-side panels.
- Keyboard essentials + SGR mouse normalization/wheel.
- Diff rendering; không fake fixed-FPS animation.
- Demo gallery normal/ultrawide/storage.

## Auto/manual gate

- alternate-screen/restore;
- cell-width/layout invariants;
- keyboard/mouse normalization;
- capability fallback;
- user nghiệm thu visual normal + ultrawide.

## Deliverables

`docs/qa/phase-09/` chứa đủ 4 handoff files.

## Trạng thái hiện tại

```text
IMPLEMENTED — WAITING BATCH 06-09 AUTOMATED VERIFICATION + USER HISTORY VISUAL ACCEPTANCE
```

```powershell
.\scripts\phase6-9-verify.ps1
npm run demo:history
```
