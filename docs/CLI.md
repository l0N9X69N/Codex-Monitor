# CLI Reference

## Product actions

```text
codexm                              Start passive Live Monitor and official Codex
codexm --manager                    Open Session Manager without spawning Codex
codexm --configure                  Open shared Config
codexm --reset                      Confirm Monitor-preferences reset
codexm --config                     Print effective Monitor config
codexm --config-path                Print Monitor config path
codexm --doctor                     Sanitized diagnostics
codexm --diagnostics                Alias of --doctor
codexm --repair                     Repair Monitor-owned Archive integration
codexm --update                     Check GitHub Releases; no auto-install
codexm --uninstall                  Remove Monitor-owned hook/service integration
codexm --version                    Print Codex Monitor version
codexm --monitor-version            Explicit version alias
```

## Runtime overrides

```text
--auth auto|api|login
--preset recommended|compact|full|custom
--theme color|mono|matrix
--background terminal|black|dark
--lang vi|en
--manager-view operations|table|charts|auto   (requires --manager)
```

Runtime overrides affect one invocation only. Persisted preferences change only through an explicit Config Save.

## Codex passthrough

Unknown arguments are forwarded to official Codex in original order.

`--` ends Monitor parsing and forwards every following argument unchanged:

```text
codexm -- --version
codexm -- --help
codexm -- --some-future-codex-flag
```

`--history` is not Monitor-owned in v1 and is therefore forwarded to official Codex.

## Input ownership

Before Codex spawn, onboarding/config/Manager may own terminal input. Once official Codex is spawned, Codex owns 100% of stdin; Live Monitor adds no input hotkeys.
