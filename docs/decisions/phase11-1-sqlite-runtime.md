# Phase 11-1 Decision: SQLite Runtime and Local Data Path

## Decision

Phase 11-1 uses the SQLite implementation built into Node.js through `node:sqlite` and `DatabaseSync`.

Codex Monitor therefore requires Node.js `>=22.13 <27`. Node 22.13 is the minimum because `node:sqlite` is available without the `--experimental-sqlite` startup flag from that release onward.

No external SQLite executable, SQLite server, `better-sqlite3`, `sqlite3`, `node-gyp` build, or pre-created database file is part of the product contract.

## Runtime contract

- The archive database is local-only and file-backed.
- The file is created lazily only when archive runtime code explicitly opens it. Merely importing configuration or computing the path must not create a database.
- `ArchiveRepository.initialize()` owns schema bootstrap and migration bookkeeping.
- WAL, `synchronous=NORMAL`, foreign keys, and bounded busy timeout remain the archive defaults.
- The persistent Archive Service will be the preferred coordinated writer. Manager integration remains read-mostly and must not place SQLite on the Codex PTY/input critical path.
- Archive failure must never block Codex stdin, PTY output, terminal resize/restore, or Live rendering.

## Local data path

The database filename is `archive.sqlite3` under the Codex Monitor data directory.

- Windows: `%LOCALAPPDATA%/codex-monitor/archive.sqlite3`, falling back to `%APPDATA%` and then the user's local AppData path.
- macOS: `~/Library/Application Support/codex-monitor/archive.sqlite3`.
- Linux and other POSIX targets: `$XDG_DATA_HOME/codex-monitor/archive.sqlite3`, falling back to `~/.local/share/codex-monitor/archive.sqlite3`.
- `CODEXM_DATA_HOME` overrides the data directory for testing, portable setups, and controlled deployments.

Config storage remains separate and continues to use `monitorConfigDir()` / `CODEXM_CONFIG_HOME`.

## Repository policy

The generated SQLite database and its WAL/SHM companions are runtime state and must never be committed to Git. Source control contains only schema/migration code and tests.

## Compatibility consequence

Node 20 support is intentionally dropped for Codex Monitor v1 rearchitecture. This avoids adding a second native SQLite dependency solely for an end-of-life runtime and keeps installation behavior consistent across Windows, macOS, and Linux.
