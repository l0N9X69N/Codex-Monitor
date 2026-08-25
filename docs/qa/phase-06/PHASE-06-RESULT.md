# Phase 06 — Result

## Trạng thái

**IMPLEMENTED FOR NEW BASELINE — chờ automated verification + Windows manual visual/input acceptance.**

## Baseline mới

Phase 06 được reworked theo `PROJECT-SPEC.md` frozen 2026-08-25:

```text
Live Monitor = passive single HUD
Official Codex = owns every keyboard byte
No Live tabs / no F4 / no Monitor navigation
Session Manager = future Phase 08
```

## Đã làm

- config schema v2 bỏ effective `tabs`; legacy tabs bị ignore khi normalize;
- configure flow không còn hỏi Live Tabs;
- runtime Live data demand chuyển sang single passive dashboard;
- system collector chỉ demand khi SYSTEM thực sự hiển thị;
- Performance/Processes continuous collectors không còn được demand bởi dead Live views;
- public `--history` semantics bị loại; `--manager` được reserve cho Phase 08;
- unused Live input router/hotkey command mode bị remove;
- `live-runner` giữ zero-parser input path: mọi stdin byte forward cho official Codex;
- wide/full Live HUD được phục hồi outer frame + 4 primary zones theo visual floor v1 trước refactor;
- narrow/short vẫn dùng responsive fallback;
- Phase 06 có standalone verify script, không dùng batch 06–09 nữa.

## Visual floor

Wide/full phải có tối thiểu:

```text
CODEX MONITOR · FULL
status strip
CONTEXT | USAGE | SESSION | CURRENT ACTIVITY
outer frame + panel separators
semantic color + quota/context bars khi đủ width
```

Mục tiêu Phase 06 là phục hồi ít nhất chất lượng v1 trước refactor. Polish đẹp hơn được làm sau khi baseline correctness/visual này pass.

## Chưa được tuyên bố PASS

Automated test chưa được chạy trong môi trường user sau các commit mới. Windows manual visual/input/resize/restore cũng chưa được user xác nhận.

## Exit gate còn lại

```powershell
.\scripts\phase6-verify.ps1
```

Sau auto PASS, hoàn thành `MANUAL-TEST-REQUIRED.md`.
