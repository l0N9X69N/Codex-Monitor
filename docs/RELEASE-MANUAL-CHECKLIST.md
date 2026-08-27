# Release Manual Checklist

Record each item as PASS / FAIL / N/A with platform and notes. Do not infer real-platform PASS from mocks/adapters.

## Product shell

- [ ] Clean install exposes `codexm`.
- [ ] First-run appears before Codex and Archive remains Disabled by default.
- [ ] Relaunch after Save skips onboarding.
- [ ] Unknown Codex args forward unchanged.
- [ ] `--` exact passthrough works.
- [ ] `--manager` does not spawn Codex.
- [ ] `Manager -> C` and `--configure` share state.
- [ ] Reset preserves Codex auth/sessions and Archive DB.
- [ ] Non-interactive control commands do not prompt.

## Live

- [ ] Login auth flow.
- [ ] API auth flow where available.
- [ ] Recommended / Compact / Full / Custom.
- [ ] Passive stdin ownership after Codex spawn.
- [ ] Narrow / normal / wide terminal rendering.
- [ ] Theme/background/capability fallback.
- [ ] Ctrl+C / exit restores terminal.
- [ ] Archive OFF/ON does not cause visible input latency regression.

## Manager

- [ ] Operations / Table / Charts / Auto.
- [ ] Search/filter/sort/detail/timeline.
- [ ] LIVE / ENDED / ARCHIVED representation.
- [ ] Manager Config preview/navigation.
- [ ] Storage/delete safety and partial-failure reporting.
- [ ] Saved Manager default vs one-shot override.
- [ ] Large-session stress remains usable.
- [ ] Terminal restore.

## Archive

- [ ] OFF -> ON creates/migrates SQLite only after explicit Save.
- [ ] Monitor-owned hooks installed without replacing unrelated hooks.
- [ ] Service starts/wakes and reconcile reaches healthy state.
- [ ] Missed hook signal recovers through reconcile.
- [ ] Missed fs.watch signal recovers through reconcile.
- [ ] Service restart/crash catches up from committed offsets.
- [ ] Partial/malformed JSONL does not advance committed offset past committed data.
- [ ] Raw deletion can leave ARCHIVED analytics.
- [ ] Archive deletion does not delete raw JSONL.
- [ ] Compact Archive behaves safely.
- [ ] ON -> OFF stops/removes Monitor-owned background integration and retains DB.
- [ ] Disabled launch has zero Archive Service start activity.

## Product controls

- [ ] `--doctor` output sanitized.
- [ ] `--diagnostics` matches doctor.
- [ ] `--repair` Disabled no-op and enabled ownership boundary.
- [ ] `--update` checks releases, does not auto-install, failure is non-blocking.
- [ ] background update check is throttled and can be disabled in Config.
- [ ] `--uninstall` removes only Monitor-owned hooks/service and preserves data.
- [ ] npm uninstall/link removal leaves official Codex usable.

## Upgrade / migration

- [ ] Existing old Monitor config migrates without forced onboarding.
- [ ] Migration never auto-enables Archive.
- [ ] Old Archive DB schema upgrades transaction-safely.
- [ ] Failed Archive migration leaves Live/Codex usable.
- [ ] Archive-only history survives supported upgrade.
- [ ] Downgrade limitations documented if applicable.

## Release artifact

- [ ] `npm run verify:phase13` PASS.
- [ ] `npm run package:smoke` PASS.
- [ ] `npm run release:artifact` produces `.tgz` and `SHA256SUMS`.
- [ ] Package contains no local config/auth/session/archive/runtime data.
- [ ] README / SECURITY / PRIVACY / CHANGELOG current.
- [ ] Signing/timestamp: PASS / N/A with reason.

## Platform matrix

| Platform | Core Live/Manager | Archive hooks/service/SQLite | Packaging/install | Status |
| --- | --- | --- | --- | --- |
| Windows |  |  |  |  |
| Linux |  |  |  | UNVERIFIED until real-machine evidence |
| macOS |  |  |  | UNVERIFIED until real-machine evidence |
