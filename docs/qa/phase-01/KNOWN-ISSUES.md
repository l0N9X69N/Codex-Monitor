# Phase 01 — Known Issues / Deferred

## BLOCKER

Không có blocker ngoài các P0 manual test đang chờ retest.

## P0

### P0-01 — Windows npm shim giữ PTY chưa kết thúc sau `/exit`

**Quan sát trên máy người dùng:** official Codex UI nhận `/exit`, nhưng wrapper chưa quay lại PowerShell cho đến khi nhấn Ctrl+C thêm một lần.

**Nguyên nhân nghi ngờ:** Phase 01 ban đầu spawn `codex.cmd` qua một `cmd.exe /c` trung gian. Với ConPTY, shell trung gian này có thể giữ PTY/process lifecycle lâu hơn Codex JS process thật.

**Fix hiện tại:** trên Windows, nếu `codex.cmd` là npm shim tiêu chuẩn và tìm thấy `node_modules/@openai/codex/bin/codex.js`, Monitor bypass `cmd.exe` và spawn trực tiếp launcher bằng Node. Vẫn giữ `cmd.exe` làm fallback khi launcher không thể resolve.

**Trạng thái:** FIXED IN CODE — WAITING USER RETEST.

### P0-02 — Ctrl+C cần xác định khác biệt giữa official Codex và wrapper

Người dùng quan sát wrapper cần Ctrl+C hai lần để thoát. Điều này chỉ là bug của Monitor nếu official `codex` chạy trực tiếp trong cùng terminal không có hành vi tương tự.

Retest bắt buộc so sánh:

```powershell
codex
```

với:

```powershell
node .\src\cli\codexm.js
```

Nếu cả hai đều dùng lần Ctrl+C đầu để cancel/clear và lần thứ hai để exit thì đó là semantics của official Codex, không phải regression của wrapper. Nếu official Codex thoát với một lần nhưng wrapper cần hai lần thì P0-02 vẫn FAIL.

## DEFERRED theo roadmap

- Phase 01 chưa vẽ Live HUD; đây là chủ ý, không phải regression.
- Full auth verification từ current rollout/session sẽ được nối sâu hơn khi parser/collector Phase 02 hoàn thiện.
- Platform Adapter đầy đủ Windows/Linux/macOS thuộc Phase 07. Phase 01 chỉ cô lập code PTY hiện tại trong `src/platform/pty.js` để tránh rải OS conditionals.
- `ACTUAL MODEL` giữ unknown cho đến khi có evidence đáng tin; Phase 01 không tạo inference completed-turn = actual model.
- Login 5H/Week không được prefill từ lịch sử; UI quota thuộc các phase Live sau.
