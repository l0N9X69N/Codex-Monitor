# Phase 12 Known Issues

Status: **CLOSE-CANDIDATE KNOWN ISSUES / DEFERRED POLISH**

No known issue in this document is currently classified as a Phase 12 BLOCKER or P0. The latest 12D auto verifier still must be rerun before that statement can be used for closeout.

## Deferred to Phase 13 final cross-phase review

- Final visual/wording/localization polish across onboarding, Config, Live and Manager is intentionally deferred so UI fixes can be reviewed consistently rather than phase-by-phase.
- Source-runtime behavior exists, but global install/PATH setup, packaging, signing, installers, uninstall behavior, release artifacts and productized service lifecycle are Phase 13 work.
- Linux/macOS require real-machine validation for product closeout; fake/platform-adapter coverage is not equivalent to target-machine verification.
- `--repair` is intentionally narrow. It repairs only Monitor-owned Archive hook/service integration and is not a generic Codex repair command.
- Manager Preview deliberately uses bounded in-memory sample sessions. It is a visual/config preview, not a real-history inspection mode.
- Config descriptions and language switching may receive final localization/copy review in Phase 13; current descriptions prioritize semantic usefulness over final copy polish.

## Inherited Phase 11-1 review items

- Archive-backed Manager paths may still perform redundant lightweight raw-summary reads in some cases. Treat as a performance optimization candidate unless target-machine profiling shows material churn.
- SQLite Compact/VACUUM behavior and extreme archive sizes remain final target-machine performance review items.
- Archive Service in the current source stage is a detached Node process, not yet a productized native OS service.

Any correctness, data-loss, destructive-safety, terminal-restoration or privacy regression discovered before Phase 12 close must be fixed immediately rather than deferred as polish.
