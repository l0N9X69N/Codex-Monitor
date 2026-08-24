# Phase 05 — Auto Test Report

## Trạng thái

**WAITING USER RUN**

## Lệnh chuẩn

```powershell
.\scripts\phase5-verify.ps1
```

Script chạy:

```text
Syntax check
Full cumulative regression: node --test
Focused Phase 05 snapshots + hysteresis/UX + deterministic fuzz
```

## Fuzz mặc định

```text
seed       = 1592594996
iterations = 4000 per fuzz invocation
```

Có thể reproduce bằng environment variables:

```powershell
$env:CODEXM_PHASE5_FUZZ_SEED='1592594996'
$env:CODEXM_PHASE5_FUZZ_ITERATIONS='4000'
npm run test:phase5
```

## Coverage Phase 05

- thousands of width/height/config combinations;
- sections/metrics/header/tabs/theme/auth/activity combinations;
- Vietnamese/Unicode/emoji project labels;
- no crash / no negative lane width / no row overflow;
- terminal-cell no-wrap invariant;
- HUD rows <= height budget;
- active navigation remains represented;
- SGR/ANSI sequences do not remain unterminated;
- Login/API quota isolation across dimensions;
- canonical golden snapshots for narrow/normal/two-lane/wide/ultrawide;
- lane threshold hysteresis;
- wide -> narrow -> wide resize sequence;
- UX hierarchy checks for Activity, Context and Login quota;
- Phase 01–04 regression remains in full suite.

## PASS condition

```text
Syntax PASS
Full regression FAIL = 0
Focused Phase 05 FAIL = 0
Layout invariant failure = 0
```

Automated PASS chưa tự đóng phase vì Phase 05 còn manual UX visual acceptance.
