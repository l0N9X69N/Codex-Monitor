# Codex Monitor v1 — rearchitecture branch

This branch is being rebuilt from the frozen `PROJECT-SPEC.md`.

Current milestone: **Phase 01 — Correctness & Terminal Safety**.

Phase 01 intentionally keeps the runtime visually minimal. Its job is to establish a safe official-Codex PTY wrapper, current-run-only state semantics, authentication isolation, freshness rules, session binding rules, and terminal recovery before the Live UI is rebuilt.

## Development requirements

- Node.js 20–26
- npm
- official `codex` CLI available on `PATH`

Install dependencies:

```powershell
npm install
```

Run automated Phase 01 verification:

```powershell
.\scripts\phase1-verify.ps1
```

Or directly:

```powershell
npm run verify:phase1
node .\src\cli\codexm.js --doctor
```

Run the current wrapper baseline:

```powershell
node .\src\cli\codexm.js
```

Explicit auth override for the current invocation:

```powershell
node .\src\cli\codexm.js --auth api
node .\src\cli\codexm.js --auth login
```

`--` stops Monitor option parsing and passes the rest directly to official Codex:

```powershell
node .\src\cli\codexm.js -- --help
```

Manual Phase 01 acceptance steps are in:

```text
docs/qa/phase-01/MANUAL-TEST-REQUIRED.md
```

`PROJECT-SPEC.md` remains the source of truth. If this README conflicts with it, the spec wins.
