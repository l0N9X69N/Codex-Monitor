# Phase 01 — Auto Test Report

## Môi trường thực thi của bản triển khai

- Node.js: v22.16.0
- npm: 10.9.2
- OS test runner: Linux container
- Commit đích: branch `v1-rearchitecture`

## Lệnh đã chạy thực tế

```text
npm run check
npm test
npm run verify:phase1
```

## Kết quả cuối

```text
Syntax files checked: 24
Tests:                23
Passed:               23
Failed:               0
Skipped:              0
Cancelled:            0
```

Lần `npm run verify:phase1` cuối hoàn thành khoảng 232 ms cho test runner và báo:

```text
Phase 01 automated verification: PASS
```

## Những gì bộ test đã chứng minh

- current-run reset không carry telemetry cũ;
- Login/API isolation ở state;
- `0` khác unknown/null;
- freshness waiting/current/stale;
- Actual Model khởi tạo unknown, không auto-copy requested model;
- current session selection không chấp nhận mtime đơn thuần;
- resumed session chỉ hợp lệ khi có current-run append evidence;
- activity priority;
- auth override/env/status parsing;
- forced Login không sửa parent environment;
- Windows `.cmd` auth-status spawn plan dùng `ComSpec`;
- TerminalGuard idempotent;
- normal PTY child exit và SIGTERM simulated đều restore raw mode;
- process-safety fatal/signal callbacks restore trước khi xử lý tiếp;
- CLI `--` escape hatch và `--version` passthrough semantics.

## Chưa được chứng minh bởi môi trường auto-test này

`npm install`/native PTY dependency không hoàn tất trong build container do network timeout, nên ConPTY/PTY thật không được chạy ở đây.

Điều này **không được coi là PASS**. Máy người dùng phải chạy:

```powershell
.\scripts\phase1-verify.ps1
```

sau đó thực hiện checklist:

```text
docs/qa/phase-01/MANUAL-TEST-REQUIRED.md
```

Manual PTY/terminal acceptance là exit gate còn lại của Phase 01.
