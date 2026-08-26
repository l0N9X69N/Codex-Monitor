# Phase 08 — Known Issues / Deferred

## BLOCKER

### P0 — Windows Manager misclassified active sessions as ENDED

Manual test on a real Windows session tree found:

```text
Sessions: 63 · LIVE 0 · ENDED 62 · UNKNOWN 1
```

while two Codex terminals were actively running.

Root cause: successful process-tree collection was incorrectly treated as negative evidence for every session whose thread id was not present in a process command line. Normal Codex launches do not guarantee that thread id is visible in the command line.

Fix checkpoint:

- detect Codex process family explicitly;
- exact thread-id command match remains strong LIVE evidence;
- unique process-start/session-start correlation can provide LIVE evidence;
- if Codex processes exist but a particular session cannot be mapped, state remains UNKNOWN rather than ENDED;
- only a successful process query with zero Codex processes is strong global negative process evidence;
- Manager summary now prints Codex process/root diagnostics for manual retest.

**Status:** FIX IMPLEMENTED — awaiting local verify + real two-terminal retest.

## Cần nghiệm thu

- Retest 2–3 active Codex terminals on Windows after process-correlation fix.
- Close one Codex and observe transition without false LIVE persistence.
- Startup on a large real Codex session tree.
- Tail growing rollout files on Windows.
- Parser coverage with rollout event variants from the installed Codex version.

## Deferred

- Charts: Phase 10.
- Delete/archive/storage mutation: Phase 11.
- Không tạo History database.
