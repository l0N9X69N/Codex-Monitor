# Phase 08 — Result

## Trạng thái

**CLOSED — 2026-08-26. Automated verification PASS; real Windows multi-session acceptance PASS; P0 = 0.**

## Kết quả đã nghiệm thu

- `src/manager/session-core.js` cung cấp metadata-first Session Manager core với `LIVE / ENDED / UNKNOWN`.
- mtime-only không được dùng để claim LIVE.
- Process/session correlation hỗ trợ exact thread evidence, one-to-one nearest-start mapping, sticky association qua các poll và specific negative evidence khi một mapped Codex root biến mất.
- `codexm --manager` chạy persistent tracker runtime độc lập, read-only và không launch Codex.
- Manager phát hiện Codex sessions mở sau khi Manager đã chạy và remap chúng ở discovery/process cadence tiếp theo.
- Windows process collection không phụ thuộc vào expensive per-process perf counters để trả process tree phục vụ correlation.
- Discovery không deep parse toàn bộ session tree; bounded identity enrichment chỉ probe một tập recent nhỏ.
- Failed/empty identity probe không bị lặp lại mỗi fast refresh nếu file không đổi size.
- Fast known-session refresh được giới hạn vào recent/active/missing-transition/selected set; full discovery vẫn chạy ở cadence chậm hơn để giữ eventual truth.
- Lightweight global summaries dùng bounded bootstrap/incremental tail và không fabricate incomplete totals.
- Chỉ selected session mới deep parse; đổi/bỏ selection nhả deep cache cũ.
- Selected deep tail giữ partial-line/no-duplicate/truncate semantics.
- Query contract All/Live/Ended/Search/Sort deterministic.
- Không tạo SQLite/CSV/history database.
- `--history` không phải Monitor-owned feature và tiếp tục được forward cho official Codex.

## Automated acceptance

Lệnh cuối phase:

```powershell
npm run verify:phase8
```

Người dùng báo **PASS** sau các fix cuối gồm persistent runtime, process association, bounded identity I/O và bounded fast refresh.

Automated gate bao gồm cả:

- 1000+ synthetic sessions không deep-read toàn bộ history;
- bounded `openSync/readSync` cho identity probing;
- unchanged failed probes không bị reopen mỗi fast refresh;
- fast known refresh không stat toàn bộ 1000+ sessions;
- non-selected sessions không deep-read;
- selected session alone triggers deep parse;
- persistent runtime/association regressions;
- Phase 07 platform regression.

## Real Windows manual acceptance

Trên session tree thật, Manager đã quan sát được:

```text
Sessions: 63 · LIVE 2 · ENDED 0 · UNKNOWN 61
Codex processes: 5 · roots 2 · mapped 2
Process correlation: exact 0 · sticky 0 · start 2 · missing 0
```

Poll kế tiếp giữ association:

```text
roots 2 · mapped 2
sticky 2 · start 0 · missing 0
```

Sau khi đóng một Codex trong khi Codex còn lại vẫn chạy:

```text
roots 1 · mapped 1
sticky 1 · missing 1
```

và sau transition/grace:

```text
LIVE 1 · ENDED 1
```

Manager cũng phát hiện session mới mở sau khi runtime đã chạy, tăng `mapped`/`LIVE`, rồi khi đóng session mới thì specific `missing` evidence và ENDED transition tiếp tục hoạt động.

## Exit gate

- discover/tail/classify sessions: PASS
- persistent multi-session tracking: PASS
- real multi-LIVE + independent close transition: PASS
- dynamic new-session discovery/remap: PASS
- selected-only deep parse: PASS by deterministic automated instrumentation
- bounded startup/runtime I/O: PASS by deterministic automated instrumentation
- duplicate DB/CSV: none
- P0 blockers: 0

Manager TUI/dashboard rendering thuộc Phase 09 và không chặn Phase 08.
