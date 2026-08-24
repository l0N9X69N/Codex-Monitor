# Phase 04 — Manual Test Required

## Trạng thái

**COMPLETED — PASS.**

User đã nghiệm thu Phase 04 trên Windows Terminal và xác nhận direction Live UI sau patch cuối.

## P1-01 — Demo responsive ở nhiều kích thước

**PASS**

Đã kiểm tra các activity state bằng demo:

```powershell
node .\src\cli\codexm.js --demo
node .\src\cli\codexm.js --demo-state tool
node .\src\cli\codexm.js --demo-state approval
node .\src\cli\codexm.js --demo-state error
```

Không ghi kích thước terminal cụ thể nếu không có log chính xác trong handoff.

## P1-02 — Themes và presets

**PASS**

Đã kiểm tra:

```powershell
node .\src\cli\codexm.js --demo --preset compact --theme color
node .\src\cli\codexm.js --demo --preset full --theme mono
node .\src\cli\codexm.js --demo --preset full --theme matrix
```

Semantics giữ nguyên giữa themes/presets theo acceptance.

## P0-03 — Login/API quota isolation UI

**PASS**

Observed behavior:

- Login render có `5H` và `WEEK`.
- API render không có Login quota.

## P1-04 — Live thật + resize nhanh

**PASS — user confirmed final manual gate OK.**

Acceptance gồm Live thật, resize, interaction và clean exit theo checklist Phase 04.

## P1-05 — Tiếng Việt / Unicode

**PASS — accepted with Phase 04 visual direction.**

Automated cell-width coverage vẫn là regression gate cho Vietnamese/Unicode/emoji/ANSI.

## P1-06 — Custom ít/nhiều metric + header/tabs

**PASS — accepted with final manual Phase 04 confirmation.**

User chỉ chọn content; physical lane/width vẫn do layout engine quyết định.

## Regression phát hiện trong manual review

Trong demo Full/System, unknown RAM từng hiển thị sai thành `0`:

```text
SYSTEM CPU -- · RAM 0
```

Đã sửa để unknown giữ đúng semantics:

```text
SYSTEM CPU -- · RAM --
```

Sau patch user xác nhận lại **OK**.

## Direction acceptance

**PASS**

- Live direction được user chấp nhận.
- Không có P0/P1 manual mở cho Phase 04.
