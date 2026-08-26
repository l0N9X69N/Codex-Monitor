# Phase 08 — Manual Test Result

## Trạng thái

**PASS — real Windows multi-session acceptance completed on 2026-08-26.**

Command used:

```powershell
node .\src\cli\codexm.js --manager
```

## P0-01 — Manager không spawn Codex

**PASS.** Manager chạy như process độc lập/read-only; không tạo Codex prompt/process mới.

## P0-02 — Multiple LIVE sessions independent

**PASS.** Với hai Codex sessions đang chạy, Manager quan sát:

```text
LIVE 2
roots 2
mapped 2
start 2
```

Poll sau giữ association bằng `sticky 2` thay vì remap lại.

## P0-03 — LIVE → ENDED an toàn

**PASS.** Khi đóng một Codex trong lúc Codex còn lại vẫn chạy:

```text
roots 1 · mapped 1
sticky 1 · missing 1
```

và sau transition/grace:

```text
LIVE 1 · ENDED 1
```

Session còn chạy không bị ảnh hưởng.

## Dynamic discovery/remap

**PASS.** Trong lúc Manager vẫn chạy, mở thêm Codex/session mới làm session count tăng; process root mới được map ở poll/discovery kế tiếp, `LIVE` tăng tương ứng. Khi đóng session mới, `missing` tăng và session chuyển khỏi LIVE rồi thành ENDED.

## P1-04 — Large-session-tree I/O

**PASS bằng deterministic automated instrumentation.** Sau manual session-tree run, startup/runtime I/O được khóa bằng regression test 1000+ synthetic sessions: bounded identity opens/reads và fast refresh không stat toàn bộ set mỗi 750ms.

## P1-05 — Selected detail / non-selected lightweight

**PASS bằng deterministic automated instrumentation.** Global discovery không deep-read; selecting one session triggers exactly that deep parse; non-selected refresh không deep-read thêm session khác; release/chuyển selection nhả deep cache.

## P1-06 — Historical truth

**PASS bằng automated contract tests.** Missing/incomplete historical values giữ `null`/unknown; incomplete counts không được fabricate; current system resources không được gán ngược vào history.

## Kết luận

P0 = 0. Manual behavior quan trọng nhất (real multi-LIVE, independent close transition, dynamic new-session discovery/remap) đã PASS trên Windows thật. Các performance/I/O assertions khó đánh giá bằng mắt được khóa bằng deterministic instrumentation trong `npm run verify:phase8`.
