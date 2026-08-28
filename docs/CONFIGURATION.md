# Configuration

Codex Monitor keeps Monitor preferences separate from official Codex auth and session data.

## Entry points

- `codexm --configure`
- `Manager -> C`

Both use the same Config controller, schema and persisted state.

## Main tabs

```text
Live View
Cards
Fields
Header
Companion
Appearance
Archive
Manager
Updates
```

## Appearance themes

`Appearance -> Theme` offers four terminal treatments:

- `color` — default balanced palette with subtly colored frames and harmonious semantic text for long sessions;
- `cyberpunk` — higher-saturation cyan, magenta, neon green and amber dashboard accents;
- `matrix` — green terminal treatment;
- `mono` — ANSI-color-free presentation.

The selected theme applies to both Live Monitor and Session Manager. Terminal color capability can reduce the representation from truecolor to 256/16 colors without changing the selected theme semantics.

## Save model

- edits happen in a draft;
- Preview does not persist;
- Revert restores the last saved config;
- Cancel/Esc exits without committing the dirty draft;
- Save performs an atomic config write;
- Archive hook/service effects run only after a successful explicit Save.

## Precedence

1. one-shot CLI override;
2. persisted Monitor config;
3. product defaults;
4. terminal capability fallback representation.

## First run

A clean interactive run launches onboarding before Manager/Codex. Existing valid older configs migrate and become setup-complete without forcing onboarding again.

Malformed or future-version config is preserved until an explicit successful Save.

## Reset

`codexm --reset` resets Monitor preference draft only. It does not remove:

- official Codex login/auth;
- official Codex sessions/history;
- Local Session Archive SQLite data;
- project files or Git state.

Archive background integration is disabled only if the reset defaults are explicitly saved.
