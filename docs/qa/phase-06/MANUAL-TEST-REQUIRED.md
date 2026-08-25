# Phase 06 — Manual Test Required

Chỉ chạy manual sau khi:

```powershell
.\scripts\phase6-verify.ps1
```

PASS.

## P0-01 — Visual floor so với v1 trước refactor

**Môi trường:** Windows Terminal/PowerShell, terminal đủ rộng khoảng >= 120 cột và >= 35 hàng.

```powershell
node .\src\cli\codexm.js --preset full --demo
```

Sau đó chạy Live thật:

```powershell
node .\src\cli\codexm.js --preset full
```

**PASS:**

- có outer frame rõ;
- title `CODEX MONITOR · FULL`;
- status strip có hierarchy;
- nhìn thấy rõ 4 vùng `CONTEXT | USAGE | SESSION | CURRENT ACTIVITY`;
- Full header có Git khi chạy trong Git repository và đủ chiều rộng;
- màu semantic/bar/spacing ít nhất tương đương screenshot v1 trước refactor;
- không trở lại kiểu text rải phẳng/xấu như bản test giữa refactor.

**FAIL:** thiếu frame/panel hierarchy, khó đọc hơn v1 cũ, telemetry dính thành một dòng phẳng.

Khi FAIL gửi screenshot + terminal size.

## P0-02 — Codex owns every keyboard byte

Trong Live Codex, thử:

```text
text bình thường
↑ ↓ ← →
Alt+Left / Alt+Right
F2 / F3 / F4
Ctrl+G
paste multiline
```

**PASS:** Monitor không đổi view, không mở History, không ăn/chặn phím; Codex nhận input theo behavior native của nó.

## P0-03 — Current-run truth

- start run mới;
- trước khi current JSONL evidence có mặt, missing telemetry giữ `--`/waiting;
- chạy vài prompt/tool;
- Context/Usage/Session/Activity chỉ phản ánh run hiện tại;
- không lấy quota/token/session cũ để fill.

## P0-04 — Login/API isolation

Login:

```powershell
node .\src\cli\codexm.js --preset full --auth login
```

API:

```powershell
node .\src\cli\codexm.js --preset full --auth api
```

**PASS:** API không hiện Login `5H/WEEK` như valid. Login quota chưa có current evidence phải waiting/`--`, không bịa số.

## P1-05 — Responsive + prompt isolation

Trong Live thật:

- kéo wide -> narrow -> wide;
- kéo height xuống thấp rồi lên cao;
- chạy output dài;
- gõ prompt ngay sau output.

**PASS:** không word-wrap telemetry ngoài ý muốn, không HUD/prompt overlap, không flicker nặng, Codex còn đủ không gian.

Header config được bảo toàn; renderer chỉ ẩn/truncate item không đủ chỗ, không xóa item khỏi config.

## P1-06 — SYSTEM demand

Preset `recommended` không bật SYSTEM mặc định. Preset `full` có SYSTEM.

**PASS:** telemetry CPU/RAM chỉ xuất hiện/được poll khi config hiển thị SYSTEM; không có Performance/Processes hidden polling từ Live tabs cũ.

## P1-07 — Git demand + local-only semantics

Chạy trong Git repository với preset Full. Tạo thay đổi local chưa commit, ví dụ sửa một file nhỏ.

**PASS:**

- header hiện branch khi đủ chỗ;
- dirty repo có `*`;
- changed file count cập nhật;
- `Δ+/-` phản ánh working-tree/staged diff so với HEAD khi Git cung cấp numstat;
- `↑/↓` chỉ hiện khi local upstream compare có dữ liệu;
- Monitor không fetch network để tính Git.

Preset `recommended` mặc định không demand Git collector.

## P1-08 — Custom header > 4

```powershell
node .\src\cli\codexm.js --configure
```

Chọn Custom và nhập nhiều hơn 4 header item hợp lệ, ví dụ:

```text
activity,model,reasoning,project,git,auth,health,session-age
```

**PASS:** config lưu đủ các item hợp lệ. Ở terminal hẹp renderer có thể chỉ hiện prefix phù hợp; kéo rộng hơn thì các item sau có thể xuất hiện mà không cần configure lại.

## P0-09 — Từng tín hiệu hiển thị một

Chạy Live Full trong repo test sạch và kiểm tra từng tín hiệu riêng, không trộn nhiều trạng thái cùng lúc.

### 09A — IDLE

Không chạy prompt nào trong vài giây.

**PASS:**

```text
IDLE waiting input
approval false
tools 0
```

### 09B — THINKING

Gửi prompt chỉ cần trả lời chữ, không yêu cầu tool, ví dụ:

```text
Trả lời đúng một câu: hello monitor
```

Quan sát trong lúc Codex đang suy nghĩ.

**PASS:** header/activity tạm thành `THINKING`; sau khi trả lời xong phải trở về `IDLE`.

### 09C — TOOL

Yêu cầu tool không cần approval, ví dụ:

```text
Đọc package.json rồi cho biết trường name, không sửa file.
```

**PASS:** trong lúc tool chạy:

```text
TOOL running tool
tools >= 1
current <tool-name>
approval false
```

Sau khi tool xong, `tools` về 0 và cuối turn về `IDLE`.

### 09D — APPROVAL thật

Yêu cầu một thao tác mà policy hiện tại bắt buộc hỏi quyền, ví dụ xóa một file test:

```powershell
Set-Content .\phase6-approval-test.txt 'test'
```

Sau đó trong Codex:

```text
Xóa file phase6-approval-test.txt và hãy dùng lệnh cần xin approval nếu Codex yêu cầu.
```

Khi Codex hiện hộp:

```text
Would you like to run the following command?
```

**PASS ngay lúc hộp approval đang mở:**

```text
APPROVAL waiting approval
approval true
```

Sau khi chọn `Yes` hoặc `No`, trạng thái không được kẹt ở APPROVAL. Khi turn hoàn tất phải về `IDLE`, `approval false`.

Các dòng tĩnh như sau **không được** tự kích hoạt APPROVAL:

```text
Permissions: Workspace (Ask for approval...)
Tip: Use /status to see ... approvals ...
You approved Codex to run ... this time
```

### 09E — Git sạch

Đưa repo về sạch:

```powershell
git status --short
```

không có output.

**PASS:** branch hiện không có `*`; changed file count/delta không báo thay đổi giả.

### 09F — Git untracked file trống

```powershell
New-Item .\phase6-git-empty.txt -ItemType File
```

Chờ ít nhất 5 giây.

**PASS:**

```text
<branch>*
1 file
Δ+0 −0
```

`Δ+0 −0` là đúng vì file trống không có dòng nội dung.

### 09G — Git untracked file có nội dung

```powershell
Set-Content .\phase6-git-empty.txt 'hello'
```

Chờ collector cập nhật.

**PASS:** dirty `*` và `1 file` vẫn còn. Line delta có thể phụ thuộc Git numstat đối với untracked file; không được dùng line delta làm bằng chứng duy nhất cho untracked content.

### 09H — Git tracked file edit để test delta

Chọn một file tracked an toàn, hoặc tạo/commit file test trước, rồi sửa một dòng. Ví dụ trong repo test riêng:

```powershell
Add-Content .\tracked-test.txt 'new line'
```

**PASS:** `1 file` (hoặc đúng tổng số file thay đổi) và `Δ+N −M` phản ánh diff so với HEAD.

Sau test xóa file test hoặc restore repo.

### 09I — ERROR

Tạo một tool command chắc chắn fail nhưng không phá dữ liệu, ví dụ yêu cầu Codex chạy:

```powershell
Get-Item .\__phase6_file_that_does_not_exist__ -ErrorAction Stop
```

**PASS:** khi error evidence xuất hiện, Activity chuyển `ERROR`, `err` tăng. Một turn mới hợp lệ phải clear `errorActive` và không để ERROR kẹt vô hạn.

### 09J — RETRY

Chỉ PASS khi có evidence retry thật từ Codex/network. Không cố tình phá network chỉ để tạo retry.

**PASS:** `retry` chỉ tăng khi parser nhận `retrying` / stream retry evidence thật; không tự tăng trong run bình thường.

## P0-10 — Terminal restore

Test cả:

```text
/exit
Ctrl+C
```

**PASS:** PowerShell trở lại sạch, cursor/raw mode/scroll region không kẹt, không còn HUD rác.

## Thông tin cần gửi lại

Nếu tất cả pass, chỉ cần gửi:

```text
Phase 06 manual PASS
Visual >= v1 baseline: PASS
Keyboard ownership: PASS
Git/header completeness: PASS
Activity lifecycle: PASS
Resize/prompt isolation: PASS
Terminal restore: PASS
```

Nếu fail, gửi screenshot/output đã loại secret + terminal width/height + bước tái hiện.
