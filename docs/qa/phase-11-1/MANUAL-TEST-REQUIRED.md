# Phase 11-1 — Manual Test Required

Status: **SOURCE-RUNTIME QA REQUIRED BEFORE IMPLEMENTATION CLOSE**

Phase 11-1 is currently tested from the repository with Node. Product installation, global `codexm` command wiring, packaging, uninstall behavior and release-native integration are not available yet and are not Phase 11-1 source-runtime closure gates.

Use the repository entrypoint:

```text
node ./src/cli/codexm.js --manager
node ./src/cli/codexm.js --configure
node ./src/cli/codexm.js --config
node ./src/cli/codexm.js
```

The archive service at this stage is a detached Node child launched from `src/archive/service-entry.js`; it is not an installed Windows service.

Run destructive checks only on disposable/temp sessions or history you are willing to delete.

## Required source-runtime verification on Windows

- Open Manager with `node ./src/cli/codexm.js --manager`; verify the Manager and Archive Config UI are usable from the source tree.
- Open `node ./src/cli/codexm.js --configure`; verify it and Manager `C -> Archive` share the same persisted config state.
- Enable Archive from the source UI; verify SQLite archive initialization and that a detached Archive Service Node process can be started/woken from the current source tree.
- Disable Archive; verify the source-launched Archive Service stops/ceases archive activity and the SQLite archive remains.
- Re-enable Archive; verify new/changed raw JSONLs reconcile without rebuilding already committed bytes.
- Run Codex through `node ./src/cli/codexm.js` while Manager is closed; open Manager afterward and verify SQLite-first history is available.
- Kill the detached Archive Service Node child during an active wrapped Codex session; verify Codex remains unaffected and a later source-runtime wake/restart catches up from the committed offset.
- Verify a LIVE JSONL alternates READY-at-high-water -> CATCHING_UP -> READY while appending without token/turn/tool double-count after SQLite commits.
- Delete raw only and verify archived analytics remain as ARCHIVED.
- Delete archive only and verify raw JSONL remains untouched and intentional suppression prevents immediate archive resurrection.
- Delete Everything on a disposable session and verify raw + archive removal. Where practical, force a raw-unlink failure and verify archive is preserved for that failed raw row and partial failure is reported honestly.
- Clear Archive and verify raw Codex session files are unchanged.
- Compact Archive only while the source-launched Archive Service is idle/stopped; verify refusal while service is running and successful maintenance when allowed.
- Exercise Config Save/Revert/Esc and verify archive state changes apply correctly without restarting the Manager process.

## Performance/manual observation at source stage

- Compare wrapped Codex input/output/HUD responsiveness with Archive disabled versus enabled using `node ./src/cli/codexm.js`.
- Observe the detached Archive Service Node process while idle; target near-zero CPU and disk writes after idle grace.
- Use the largest realistic local history available and assess Manager first render, navigation, search/filter and detail responsiveness.
- If a large UNINDEXED source is available, run it alongside a small active indexed session and verify the active delta remains responsive.
- Observe disk activity for archive-backed LIVE rows. Redundant lightweight raw-summary reads are an accepted optimization candidate only if they do not create visible latency or material disk churn.

## Privacy/network source-stage spot check

- Inspect representative SQLite rows and verify no raw prompt, assistant response, full shell stdout, full tool response, file contents or terminal transcript are persisted by default.
- Verify the source-launched Archive Service does not create archive network requests or open a network listener.

## Deferred to Phase 12/13 productization QA

The following are explicitly **not** Phase 11-1 source-runtime closure gates because the product shell/install/package layer is not complete yet:

- installing `codexm` globally / PATH shim behavior;
- first-run installer/onboarding behavior;
- packaged Windows service/daemon installation, if the final product chooses one;
- installer-owned Codex hook/plugin installation/removal and uninstall cleanup;
- packaged binary/npm distribution behavior;
- update flow;
- full uninstall cleanup;
- native packaged Linux/macOS verification.

Automated hook/service/config contracts remain covered by `npm run verify:phase11-1`; real packaged integration must be re-tested when Phase 12/13 supplies the installation/product shell.

## Source-runtime close decision

Phase 11-1 implementation may close when:

- `npm run verify:phase11-1` is green;
- the required source-runtime checks above show no crash, data loss, double-counting or raw/archive delete confusion;
- wrapped Codex PTY/Live responsiveness shows no material regression with Archive enabled;
- Manager/archive performance is acceptable on realistic local history;
- privacy/network spot checks pass;
- installer/package-specific checks remain explicitly deferred rather than falsely marked verified.
