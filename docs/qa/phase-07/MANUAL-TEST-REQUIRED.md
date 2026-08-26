# Phase 07 — Manual Test Status

## Windows

**PASS — development checkpoint, reported by user on 2026-08-26.**

Manual acceptance covered the current Live path at a practical level:

1. launch `node .\src\cli\codexm.js --preset full`;
2. normal typing/input remained responsive;
3. terminal resize remained usable;
4. SYSTEM CPU/RAM updated without an observed input-lag regression;
5. normal Codex activity/tool use remained functional;
6. Ctrl+C and `/exit` paths did not reveal a terminal-restore problem;
7. no blocking platform issue was reported after the Phase 07 automated gate passed.

This is a development/manual gate, not a release certification across every Windows/Terminal/PowerShell combination.

## Linux

**UNVERIFIED PLATFORM** — no real Linux machine/CI evidence has been recorded for this checkpoint.

## macOS

**UNVERIFIED PLATFORM** — no real macOS machine/CI evidence has been recorded for this checkpoint.

Linux/macOS verification remains a productization/release gate and must not be inferred from unit tests.
