# CLI Reference

## Command family

```text
codexm              Start passive Live Monitor and official Codex
codexmm             Open Session Manager without spawning Codex
codexmc             Open shared Config
codexmh             Show Codex Monitor help
codexmctl            Monitor maintenance/control commands
```

`codexm` is a transparent wrapper around the official Codex CLI. Codex Monitor does not own short or long flags in this entrypoint.

```text
codexm -h                       official Codex help
codexm -v                       official Codex version behavior
codexm -m gpt-5                 official Codex model flag
codexm -c key=value             official Codex config override
codexm resume -m gpt-5          forwarded unchanged
codexm --some-future-flag       forwarded unchanged
```

This keeps `codexm <args>` compatible with `codex <args>` even when official Codex adds new flags later.

## Session Manager

```text
codexmm                          Open Session Manager
codexmm --view operations
codexmm --view table
codexmm --view charts
codexmm --view auto
codexmm -h / --help             Context help in the saved Monitor language
```

`--view` affects the current Manager run only. Persisted default view changes through Config.

## Config

```text
codexmc                          Open shared Config
codexmc --reset                  Confirm Monitor-preferences reset, then open Config
codexmc -h / --help              Context help in the saved Monitor language
```

Config changes are persisted only after an explicit Save.

## Help

```text
codexmh                          Show Codex Monitor product help
```

Monitor help follows the language selected during initial setup (`vi` or `en`). Manager, Config and maintenance help use the same saved language.

## Maintenance

```text
codexmctl doctor                 Sanitized diagnostics
codexmctl diagnostics            Alias of doctor
codexmctl repair                 Repair Monitor-owned Archive integration
codexmctl update                 Check GitHub Releases; no auto-install
codexmctl uninstall              Uninstall Codex Monitor while preserving user/Codex data
codexmctl version                Print Codex Monitor version
codexmctl config                 Print effective Monitor config
codexmctl config-path            Print Monitor config path
codexmctl demo [state]           Render HUD demo: idle|thinking|tool|approval|error
codexmctl help                   Maintenance help in the saved Monitor language
```

## First run

A clean interactive bare `codexm` launch may open initial setup before official Codex starts. If any Codex argument is present, including `-h`, `-v`, `-m`, `-c`, `--help` or `--version`, onboarding does not intercept the command and the arguments go directly to Codex.

## Input ownership

Before Codex spawn, onboarding/config/Manager may own terminal input. Once official Codex is spawned, Codex owns 100% of stdin; Live Monitor adds no input hotkeys.
