# Session Manager

Launch independently from Codex:

```text
codexmm
```

Manager does not spawn official Codex.

## Views

Persisted default:

```text
Operations
Table
Charts
Auto
```

Use `V` at runtime to cycle views. Runtime view changes do not silently persist. Use Config or `codexmm --view <view>` for one-shot behavior.

## Core workflows

- navigate session rows with arrow keys;
- Enter opens selected session detail where available;
- search/filter/sort operate on the Manager model;
- `C` opens shared Config;
- Config `P` opens Live preview and `M` opens Manager preview;
- storage controls expose raw/archive/everything safety semantics;
- Archive health is represented as runtime state, not silently rewritten into saved preference.

## Session states

Manager can represent LIVE, ENDED and ARCHIVED sessions. When Archive is enabled, SQLite is the historical analytics base and active JSONL data can overlay/rebase on that base without double-counting.

## Terminal behavior

Manager uses raw-mode terminal input while active and must restore terminal state on normal exit, Esc flows, Ctrl+C and handled signals.
