# Phase 06 — Passive Live HUD Completion & v1 Visual Baseline

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline, frozen 2026-08-25. Nếu tài liệu phase mâu thuẫn với `PROJECT-SPEC.md`, **PROJECT-SPEC.md thắng**.

## Spec liên quan

Sections 1, 2.1, 4–5, 11–15, 28–32, 38, 40 và 42.

## Mục tiêu

Chốt Live Monitor thành **một HUD thụ động duy nhất**, current-run only, không sở hữu navigation input, đồng thời phục hồi chất lượng hiển thị tối thiểu bằng hoặc tốt hơn giao diện v1 trước refactor trước khi tiếp tục polish visual ở các phase sau.

Phase 06 là điểm migration bắt buộc từ mô hình cũ `Live tabs + hotkeys + History shortcut` sang product contract mới:

```text
codexm
  ├── official Codex owns every keyboard byte
  └── passive Live HUD only
```

## Visual regression floor

Ở terminal đủ rộng/cao, preset `full` phải đạt ít nhất cấu trúc/độ rõ tương đương giao diện v1 trước refactor:

```text
┌─ CODEX MONITOR · FULL ──────────────────────────────────────────────┐
│ ● STATUS · MODEL · REASONING · PROJECT · GIT · AUTH                │
├───────────────┬────────────────┬───────────────┬────────────────────┤
│ CONTEXT       │ USAGE · LOGIN  │ SESSION       │ CURRENT ACTIVITY   │
│ primary data  │ quota / tokens │ elapsed/turns │ state/detail       │
│ bar + detail  │ bar + detail   │ freshness     │ tools/retry/error  │
└───────────────┴────────────────┴───────────────┴────────────────────┘
```

Yêu cầu visual tối thiểu:

- outer frame và panel separators rõ ràng ở `full`/wide;
- title `CODEX MONITOR · <PRESET>`;
- status strip có hierarchy, không phải một dòng telemetry phẳng;
- `CONTEXT`, `USAGE`, `SESSION`, `CURRENT ACTIVITY` là các vùng nhìn ra ngay;
- context/quota có bar khi đủ width;
- semantic color giữ Green/Gold/Blue/Orange/Red/Cyan/Purple/Muted;
- spacing/padding đủ đọc, không telemetry wall;
- narrow/short terminal được phép giảm border/detail nhưng không wrap/overflow;
- visual polish tương lai có thể đẹp hơn, nhưng không được regression xuống dưới baseline này.

## Phạm vi phải làm

### 1. Live là display-only

Loại khỏi runtime/public Live contract:

- interactive tabs;
- Alt/arrow/F-key Monitor navigation;
- F4 History launcher;
- Ctrl+G command mode;
- mouse navigation;
- bất kỳ parser stdin nào giữ/chặn keyboard byte của Codex.

Normal input path:

```text
stdin -> official Codex PTY
```

Monitor chỉ quan sát output/session/runtime signals.

### 2. Single-dashboard Live sections

Canonical sections:

```text
CONTEXT
USAGE
SESSION
ACTIVITY
SYSTEM (optional)
```

`SYSTEM` chỉ collect khi user config yêu cầu.

`ACTIVITY` có thể dùng current/last tool evidence, approval, retry và error; không cần một Tools tab riêng.

### 3. Current-run correctness

- startup hard reset giữ `0` vs `--` semantics;
- current session bind cần evidence, mtime-only không đủ;
- Login quota bắt đầu `--` cho đến khi current run có evidence;
- API mode tuyệt đối không hiển thị Login 5H/WEEK như valid;
- requested/actual model tách biệt;
- stale data không masquerade thành current.

### 4. Config migration

Bump config schema và migrate legacy config:

- bỏ `tabs` khỏi effective v1 config;
- legacy `tabs` được ignore an toàn khi load;
- configure flow không hỏi Live Tabs;
- presets vẫn là `recommended|compact|full|custom`;
- user chọn sections/metrics/header/theme, layout engine chọn placement.

### 5. Demand-driven collectors

- session/current-run collector chạy vì core Live data cần;
- optional system/disk/process-derived metric chỉ chạy khi metric đó thực sự hiển thị;
- Git branch/diff/ahead-behind vẫn metric-level demand, không network fetch;
- không Resources filesystem scan chỉ vì code tồn tại;
- không Performance/Processes continuous polling nếu Live config không hiển thị metric tương ứng.

### 6. Responsive + terminal safety

- no telemetry word-wrap;
- Unicode cell width đúng;
- resize debounce + hysteresis;
- HUD không đè prompt;
- child Codex luôn có tối thiểu safe rows;
- only repaint when state/frame changes, ngoại trừ repair khi child terminal-control sequence có thể clobber HUD;
- exit/crash/signal restore scroll region/raw mode/cursor sạch.

## Không làm trong Phase 06

- Không Session Manager UI.
- Không `--history` public feature.
- Không dashboard analytics nhiều screen trong Live.
- Không historical CPU/RAM/process telemetry.
- Không pricing/cost.
- Không decorative animation.
- Không delete session.

## Auto test bắt buộc

- every ordinary keyboard byte passes unchanged to Codex;
- no Live navigation shortcut interception;
- config v1/legacy with `tabs` migrates to schema mới without effective tabs;
- wide Full visual structure có frame/title/4 primary zones;
- narrow/normal/wide/ultrawide no-wrap + row-budget invariants;
- Login/API quota isolation;
- current-run evidence rules;
- unknown remains `--`, zero remains `0`;
- optional collector demand OFF khi metric không hiển thị;
- Git branch-only không chạy diff/ahead-behind;
- HUD repair/resize/exit restore integration;
- cumulative Phase 01–05 regression sau khi update các snapshot/test đã bị spec mới supersede.

## Manual test bắt buộc — Windows hiện tại

1. Chạy `node .\src\cli\codexm.js --preset full`.
2. So visual với screenshot v1 trước refactor: phải có frame/panel hierarchy tương đương hoặc tốt hơn.
3. Gõ text, arrow, Alt+Arrow, F-keys, paste multiline trong Codex: Monitor không được ăn phím.
4. Resize narrow/wide/short/tall: không overlap prompt/HUD.
5. Chạy vài turn/tool: Context/Usage/Session/Activity cập nhật current-run.
6. Test Login và API mode; API không có Login quota.
7. `/exit` và Ctrl+C: PowerShell restore sạch.

Linux/macOS không thuộc exit gate Phase 06 nếu chưa có máy thật; cross-platform verification thuộc Phase 07.

## Deliverables

```text
docs/qa/phase-06/PHASE-06-RESULT.md
docs/qa/phase-06/AUTO-TEST-REPORT.md
docs/qa/phase-06/MANUAL-TEST-REQUIRED.md
docs/qa/phase-06/KNOWN-ISSUES.md
scripts/phase6-auto-verify.mjs
scripts/phase6-verify.ps1
```

## Exit gate

```text
mandatory auto tests PASS
BLOCKER = 0
P0 = 0
Live keyboard ownership = Codex only
wide Full visual >= pre-refactor v1 baseline
manual Windows P0/P1 PASS
terminal restore PASS
```

## Trạng thái hiện tại

```text
IN PROGRESS — REWORKING TO PROJECT-SPEC 2026-08-25
```
