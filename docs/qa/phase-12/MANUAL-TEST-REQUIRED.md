# Phase 12 Manual Test Required

Status: **SOURCE-RUNTIME UX CLOSEOUT REQUIRED AFTER LATEST AUTO PASS**

This Phase 12 gate is for the repository/source runtime. Do not assume a globally installed `codexm` yet. Use the repository entry point on Windows Terminal, for example:

```bash
node ./src/cli/codexm.js --manager
node ./src/cli/codexm.js --configure
node ./src/cli/codexm.js --doctor
node ./src/cli/codexm.js --repair
```

Use disposable/temp config or Archive fixtures for destructive checks. Do not casually delete real `~/.codex/sessions` data.

## Focused Windows Terminal checklist

1. Start from a clean disposable Monitor config state and launch `node ./src/cli/codexm.js`; verify first-run onboarding appears before Codex starts.
2. Save Recommended + Operations; verify Archive remains Disabled.
3. Relaunch and verify first-run does not appear again.
4. Launch `--manager`; verify the saved default Manager view is used. Press `V`, exit, relaunch, and verify runtime cycling did not silently persist.
5. In Manager press `C`; verify shared Config opens. Use `P` Live preview and `M` Manager preview, then Esc back to Config. Verify tab/cursor/draft state remains usable and nothing saves merely by previewing.
6. Run `--configure`; verify the same current settings/tabs are presented. Exercise Save, Revert and Esc/Cancel.
7. Change to Custom + another Theme/Background + another Manager default view, preview both renderers, Save, and verify the next Manager launch uses the saved view.
8. With a disposable malformed config, launch an interactive recovery path. Verify the original malformed file remains unchanged until explicit Save.
9. With a disposable future `configVersion`, verify the newer file is not silently downgraded/overwritten before explicit Save.
10. Run `--reset`. Verify the confirmation clearly states that Codex auth, Codex sessions/history and Local Session Archive SQLite data are preserved. Cancel once and confirm nothing changes. Confirm again, enter Config, then Esc without Save and confirm nothing changes. Finally Save defaults and verify only Monitor preferences reset; Archive background indexing is disabled if it had been enabled, while SQLite archive data remains.
11. Run `--doctor`; verify output is local/sanitized and does not contain prompts, assistant responses, full tool output, tokens/secrets, or transcript contents. If Archive is enabled/degraded, verify the status is reported honestly rather than forced to READY.
12. Run `--repair` while Archive is Disabled; verify it is a no-op. On disposable Archive-enabled state, verify it repairs only Monitor-owned Archive hook integration and wakes reconcile; unrelated Codex hooks/plugins, auth, sessions and archive data must remain untouched.
13. Pipe/redirect non-interactive control commands where applicable; verify no alternate-screen wizard opens and nothing waits for a keypress.
14. Press Ctrl+C during onboarding/config and verify raw mode, cursor and alternate screen are restored cleanly.
15. Check narrow, normal and wide terminal sizes for onboarding, Config and Preview readability/no wrapping corruption.
16. Toggle Archive ON/OFF through Config on disposable data and verify lifecycle effects happen only after Save; Cancel/Revert must not change service/hook state.
17. If Archive runtime is intentionally degraded, verify Config/Doctor reports ATTENTION/degraded state instead of silently changing the saved preference.

Linux/macOS real-machine behavior remains **UNVERIFIED PLATFORM** unless tested on actual target machines. Do not infer PASS from Windows or fake adapters.
