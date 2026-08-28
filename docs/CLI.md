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

## Session Manager

```text
codexmm                          Open Session Manager
codexmm --view operations
codexmm --view table
codexmm --view charts
codexmm --view auto
codexmm -h / --help             Context help in the saved Monitor language
```

## Config

```text
codexmc                          Open shared Config
codexmc --reset                  Confirm Monitor-preferences reset, then open Config
codexmc -h / --help              Context help in the saved Monitor language
```

## Help

```text
codexmh                          Show Codex Monitor product help
```

Help follows the language selected during initial setup (`vi` or `en`).

## Maintenance

```text
codexmctl doctor                 Sanitized diagnostics
codexmctl diagnostics            Alias of doctor
codexmctl repair                 Repair Monitor-owned Archive integration
codexmctl update                 Check GitHub Releases; no auto-install
codexmctl version                Print Codex Monitor version
codexmctl config                 Print effective Monitor config
codexmctl config-path            Print Monitor config path
codexmctl demo [state]           Render HUD demo: idle|thinking|tool|approval|error
codexmctl help                   Maintenance help in the saved Monitor language
```

There is intentionally no install/uninstall command in `codexm` or `codexmctl`. Product installation and removal use the external root GitHub scripts only:

```powershell
irm https://raw.githubusercontent.com/l0N9X69N/Codex-Monitor/v1-rearchitecture/install.ps1 | iex
irm https://raw.githubusercontent.com/l0N9X69N/Codex-Monitor/v1-rearchitecture/uninstall.ps1 | iex
```

This keeps self-removal outside the running CLI process and gives install/uninstall one ownership boundary.

## First run

A clean interactive bare `codexm` launch may open initial setup before official Codex starts. If any Codex argument is present, onboarding does not intercept it.

## Input ownership

Before Codex spawn, onboarding/config/Manager may own terminal input. Once official Codex is spawned, Codex owns 100% of stdin; Live Monitor adds no input hotkeys.
