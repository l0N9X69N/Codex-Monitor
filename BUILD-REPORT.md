# Codex Monitor v1.0.0 — Build Report

Build date: 2026-08-24

## Architecture delivered

- `codexm-l-a` — Lite + API key
- `codexm-l-l` — Lite + ChatGPT login
- `codexm-f-a` — Full + API key
- `codexm-f-l` — Full + ChatGPT login
- `codexm` — defaults to Full + ChatGPT login (`f-l`)

## Validation

- Node syntax check: PASS
- Node test suite: 10/10 PASS
- All five npm bin targets exist and have Node shebangs: PASS
- `npm pack`: PASS
- Packaged tarball contents inspected: PASS
- Full renderer four-column structure: PASS
- 5h and Week independent quota mapping: PASS
- Context baseline math: PASS
- TOOL lifecycle persistence: PASS
- PTY APPROVAL split-chunk detection: PASS
- Stale APPROVAL resurrection prevention: PASS
- Conservative ERROR detection: PASS
- Login/API child-environment isolation tests: PASS

## Runtime notes

The build environment is Linux and does not provide a Windows ConPTY session or
the user's installed official Codex CLI. Therefore the final Windows live launch
must be smoke-tested on Windows after installation. No Rust/C++ Codex build is
required.

The npm package tarball was built successfully. Dependency installation from the
npm registry could not be exercised in this build environment because outbound
npm registry access is unavailable here. The runtime dependency remains pinned
to `@homebridge/node-pty-prebuilt-multiarch@0.14.1`.

## Package-lock note

The v1 source bundle intentionally does not include the old v0.x
`package-lock.json`, because its root package version/bin metadata is stale. The
installer does not depend on it: it packs `package.json` and installs the local
tarball. If a lockfile is desired for development, regenerate it with npm in a
networked development environment and commit the regenerated file.
