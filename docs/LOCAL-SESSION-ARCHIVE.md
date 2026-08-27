# Local Session Archive

Local Session Archive is an optional local analytics archive for Codex sessions.

## Defaults

- Disabled by default.
- Retention: Forever.
- Auto cleanup: Off.
- Size limit: Off unless explicitly configured.

## Data ownership

```text
Codex JSONL     = Codex-owned raw source
Archive SQLite  = Monitor-owned technical analytics archive
```

The Archive database is `archive.sqlite3` under the Monitor data directory. `CODEXM_DATA_HOME` can override the data path for tests/portable deployments.

## Runtime model

```text
Codex hook signal
fs.watch signal
      ↓
Archive Service wake
      ↓
JSONL discovery/reconcile
      ↓
incremental tail from committed offset
      ↓
SQLite transaction
      ↓
commit new offset only after successful data commit
```

Hooks and filesystem watches are signals only. Correctness comes from startup/safety reconcile against source files and committed offsets. Missed hook/watch signals must be recoverable.

## Enable / disable

Enable is an explicit Config Save transition:

```text
open/migrate SQLite -> install Monitor-owned hooks -> start/wake service -> reconcile
```

Disable is also explicit:

```text
request service stop -> remove only Monitor-owned hooks -> keep SQLite database
```

Archive Disabled means no Archive Service should be started by normal Live/Manager launch.

## Storage semantics

- Delete Raw removes Codex JSONL only within the explicit storage flow and may preserve Archive analytics.
- Delete Archive removes Monitor analytics only and does not remove raw JSONL.
- Delete Everything targets both according to the guarded delete rules and reports partial failures honestly.
- LIVE sessions are protected from destructive delete.
- Compact Archive reuses/reclaims SQLite storage; normal deletes do not full-VACUUM every time.

An ARCHIVED session may remain visible after raw JSONL is gone. Such history may not be rebuildable from Codex raw files, so clearing Archive is a genuinely destructive action.

## Privacy

The Archive is local-only. It is not a conversation-memory/vector database and does not upload Archive data. Hook payloads are wake signals rather than a transcript persistence channel.
