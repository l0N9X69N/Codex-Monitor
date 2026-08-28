# Configuration

Codex Monitor keeps Monitor preferences separate from official Codex auth and session data.

## Entry points

- `codexmc`
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

## Save model

- edits happen in a draft;
- Preview does not persist;
- Revert restores the last saved config;
- Cancel/Esc exits without committing the dirty draft;
- Save performs an atomic config write;
- Archive hook/service effects run only after a successful explicit Save.

## First run

A clean interactive bare `codexm` run launches onboarding before Codex. Existing valid older configs migrate without forced onboarding.

## Reset

`codexmc --reset` resets the Monitor preference draft only. It does not remove official Codex login/auth, Codex sessions/history, Local Session Archive SQLite data, project files or Git state.
