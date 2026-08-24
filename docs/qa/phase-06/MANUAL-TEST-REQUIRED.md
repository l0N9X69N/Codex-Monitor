# Phase 06 — Manual Test Required

Sau khi combined auto verification PASS:

```powershell
node .\src\cli\codexm.js --preset full
```

## P0-01 — Current-run truth

- chạy vài prompt/tool;
- Usage/Tools chỉ phản ánh run đang chạy;
- nếu chưa có evidence thì giữ `--`, không lấy số từ session cũ;
- API auth tuyệt đối không hiện Login 5H/WEEK.

## P1-02 — Live views / navigation

Dùng `Alt+Left` / `Alt+Right` qua Overview, Performance, Processes, Tools, Resources, Usage.

**PASS:** hotkey không lọt vào prompt; ký tự/phím prompt bình thường vẫn hoạt động; HUD không đè prompt.

## P1-03 — Performance / Processes

Chạy tool tạo `node`, `npm` hoặc `git`; so CPU/RAM tương đối với Task Manager.

**PASS:** process tree bám Codex PID; không kéo process ngoài tree; CPU/RAM hợp lý hoặc `--` khi OS không cung cấp evidence.

## P0-04 — Resources secret safety

Dùng project có `AGENTS.md`, Skills hoặc `.mcp.json` chứa secret giả.

**PASS:** UI chỉ hiện metadata/path/name; không hiện body/token/secret.

## P1-05 — Lazy behavior

Ở Overview quan sát Monitor không liên tục chạy process/resource collector; chuyển sang Processes/Resources mới demand chúng.

Nếu FAIL, gửi case + terminal size + output đã loại secret.
