# Phase 01 — Manual Test Required

Các case dưới đây không thể được chứng minh đầy đủ bằng unit test vì phụ thuộc terminal/PTY/ConPTY thật.

Sau khi pull branch `v1-rearchitecture`, chạy trước:

```powershell
.\scripts\phase1-verify.ps1
```

Chỉ tiếp tục manual test nếu AUTO TEST PASS.

## P0-01 — Codex exit bình thường

**Điều kiện:** Windows Terminal/PowerShell, official Codex hoạt động.

```powershell
node .\src\cli\codexm.js
```

Thoát Codex bình thường.

**PASS:** quay lại PowerShell; gõ được bình thường; cursor hiện; Enter/Backspace hoạt động; terminal không bị kẹt raw mode.

## P0-02 — Ctrl+C / interrupt

Chạy wrapper, sau đó Ctrl+C ở trạng thái idle và lặp lại khi Codex đang chạy một tool có thể hủy an toàn.

**PASS:** Codex/wrapper xử lý interrupt hợp lý và sau khi thoát terminal vẫn bình thường.

## P0-03 — Injected monitor crash sau PTY start

```powershell
node .\scripts\phase1-crash-harness.mjs
```

Harness cố ý phát lỗi sau khoảng 1.5 giây.

**PASS:** wrapper thoát/fail như dự kiến nhưng terminal được phục hồi ngay; không mất cursor, không kẹt phím.

## P1-04 — Resize stress

Chạy:

```powershell
node .\src\cli\codexm.js
```

Kéo cửa sổ hẹp/rộng/cao/thấp liên tục 10–15 giây, nhập prompt ngắn, sau đó thoát.

**PASS:** Codex không crash do resize; sau exit terminal bình thường.

## P0-05 — Login -> API isolation

1. Chạy Login bình thường để tạo/tiếp tục session.
2. Thoát.
3. Đặt `CODEX_API_KEY` hợp lệ cho shell test API.
4. Chạy:

```powershell
node .\src\cli\codexm.js --doctor
node .\src\cli\codexm.js
```

**PASS:** doctor nhận API qua `env:CODEX_API_KEY`; không có hành vi dùng quota/session cũ của Login trong Phase 01 state.

Không gửi key trong ảnh/log.

## P0-06 — API -> Login explicit override

Khi shell vẫn có `CODEX_API_KEY`, chạy:

```powershell
node .\src\cli\codexm.js --auth login
```

**PASS:** child Codex dùng explicit Login override; parent PowerShell vẫn giữ nguyên biến môi trường của user sau khi wrapper thoát.

## Khi FAIL cần gửi lại

Không gửi secret. Gửi:

```text
Windows version
Windows Terminal/terminal name + version
PowerShell version
node --version
npm --version
codex --version
node .\src\cli\codexm.js --doctor
case ID bị FAIL
các bước tái hiện
ảnh/video ngắn nếu là lỗi terminal
```
