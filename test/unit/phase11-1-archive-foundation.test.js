import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_PARSER_VERSION,
  ARCHIVE_SCHEMA_VERSION,
  ARCHIVE_SYNC_STATE,
  DEFAULT_ARCHIVE_CONFIG
} from '../../src/archive/constants.js';
import { classifyArchiveSyncState } from '../../src/archive/sync-state.js';
import { inspectArchiveSource, readCommittedJsonlChunk } from '../../src/archive/source-reader.js';
import { ARCHIVE_PRAGMAS, ARCHIVE_SCHEMA_SQL, archiveBootstrapSql } from '../../src/archive/sql-schema.js';
import { DEFAULT_CONFIG, normalizeArchiveConfig, normalizeConfig } from '../../src/config/schema.js';

function tempFile(contents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-'));
  const filePath = path.join(root, 'session.jsonl');
  fs.writeFileSync(filePath, contents);
  return { root, filePath };
}

test('archive defaults are opt-in, forever retention, unlimited size and no automatic cleanup', () => {
  assert.deepEqual(DEFAULT_ARCHIVE_CONFIG, {
    enabled: false,
    retention: 'forever',
    sizeLimitBytes: null,
    autoCleanup: false
  });
});

test('archive schema contains specialized tables, delete suppressions, cascades and WAL-oriented pragmas', () => {
  for (const table of ['sessions', 'turns', 'context_samples', 'token_samples', 'tool_events', 'session_events', 'resource_usage', 'ingest_state', 'archive_suppressions', 'archive_meta', 'schema_migrations']) {
    assert.match(ARCHIVE_SCHEMA_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(ARCHIVE_SCHEMA_SQL, /ON DELETE CASCADE/);
  assert.match(ARCHIVE_SCHEMA_SQL, /uq_tokens_offset/);
  assert.match(ARCHIVE_SCHEMA_SQL, /uq_tools_offset/);
  assert.match(ARCHIVE_SCHEMA_SQL, /uq_events_offset/);
  assert.match(ARCHIVE_SCHEMA_SQL, /idx_archive_suppressions_session/);
  assert.deepEqual(ARCHIVE_PRAGMAS, [
    'PRAGMA journal_mode=WAL;',
    'PRAGMA synchronous=NORMAL;',
    'PRAGMA foreign_keys=ON;',
    'PRAGMA busy_timeout=2500;'
  ]);
  assert.match(archiveBootstrapSql(123), new RegExp(`VALUES \\(1, ${ARCHIVE_SCHEMA_VERSION}, 123\\)`));
});

test('byte-accurate tail reader advances only through complete JSONL lines', async () => {
  const first = `${JSON.stringify({ text: 'Tiếng Việt ✓' })}\n`;
  const partial = '{"second":2';
  const { root, filePath } = tempFile(first + partial);
  try {
    const initial = await readCommittedJsonlChunk(filePath, { committedOffset: 0, maxBytes: 1024 });
    assert.equal(initial.lines.length, 1);
    assert.deepEqual(JSON.parse(initial.lines[0].text), { text: 'Tiếng Việt ✓' });
    assert.equal(initial.lines[0].sourceOffset, 0);
    assert.equal(initial.commitCandidateOffset, Buffer.byteLength(first));
    assert.equal(initial.pendingPartialBytes, Buffer.byteLength(partial));
    assert.equal(initial.highWaterVerified, false);

    fs.appendFileSync(filePath, '}\n');
    const next = await readCommittedJsonlChunk(filePath, { committedOffset: initial.commitCandidateOffset, maxBytes: 1024 });
    assert.equal(next.lines.length, 1);
    assert.deepEqual(JSON.parse(next.lines[0].text), { second: 2 });
    assert.equal(next.commitCandidateOffset, fs.statSync(filePath).size);
    assert.equal(next.highWaterVerified, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('tail reader reports truncation instead of silently rewinding a committed checkpoint', async () => {
  const { root, filePath } = tempFile('{"a":1}\n');
  try {
    const result = await readCommittedJsonlChunk(filePath, { committedOffset: 999 });
    assert.equal(result.truncated, true);
    assert.equal(result.commitCandidateOffset, 999);
    assert.equal(result.highWaterVerified, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('source inspection returns stable identity for repeated stats of the same file', async () => {
  const { root, filePath } = tempFile('{"a":1}\n');
  try {
    const first = await inspectArchiveSource(filePath);
    const second = await inspectArchiveSource(filePath);
    assert.equal(first.exists, true);
    assert.equal(first.fileIdentity, second.fileIdentity);
    assert.equal(first.size, second.size);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sync classifier enforces READY only at a verified current parser high-water mark', () => {
  const source = { size: 100, fileIdentity: '1:2:3' };
  const ingest = { committedOffset: 100, fileIdentity: '1:2:3', parserVersion: ARCHIVE_PARSER_VERSION, lastError: null };
  assert.equal(classifyArchiveSyncState({ source, ingest }), ARCHIVE_SYNC_STATE.READY);
  assert.equal(classifyArchiveSyncState({ source, ingest: null }), ARCHIVE_SYNC_STATE.UNINDEXED);
  assert.equal(classifyArchiveSyncState({ source, ingest: { ...ingest, committedOffset: 90 } }), ARCHIVE_SYNC_STATE.CATCHING_UP);
  assert.equal(classifyArchiveSyncState({ source, ingest: { ...ingest, committedOffset: 101 } }), ARCHIVE_SYNC_STATE.STALE);
  assert.equal(classifyArchiveSyncState({ source, ingest: { ...ingest, fileIdentity: 'replaced' } }), ARCHIVE_SYNC_STATE.STALE);
  assert.equal(classifyArchiveSyncState({ source, ingest: { ...ingest, parserVersion: ARCHIVE_PARSER_VERSION + 1 } }), ARCHIVE_SYNC_STATE.STALE);
  assert.equal(classifyArchiveSyncState({ source, ingest, scanComplete: false }), ARCHIVE_SYNC_STATE.CATCHING_UP);
  assert.equal(classifyArchiveSyncState({ source: null, ingest, hasArchiveData: true }), ARCHIVE_SYNC_STATE.ARCHIVED);
});

test('main config schema migrates legacy config to archive-disabled defaults', () => {
  const legacy = normalizeConfig({ configVersion: 2, language: 'en', preset: 'compact' });
  assert.equal(legacy.configVersion, 2);
  assert.equal(legacy.language, 'en');
  assert.deepEqual(legacy.archive, DEFAULT_ARCHIVE_CONFIG);
  assert.deepEqual(DEFAULT_CONFIG.archive, DEFAULT_ARCHIVE_CONFIG);
});

test('archive config normalization is conservative and never invents automatic retention', () => {
  assert.deepEqual(normalizeArchiveConfig({ enabled: true, retention: 'forever', sizeLimitBytes: 1024, autoCleanup: true }), {
    enabled: true,
    retention: 'forever',
    sizeLimitBytes: 1024,
    autoCleanup: true
  });
  assert.deepEqual(normalizeArchiveConfig({ enabled: 'yes', retention: '30d', sizeLimitBytes: -1, autoCleanup: 'yes' }), DEFAULT_ARCHIVE_CONFIG);
});

test('archive schema is executable with built-in node:sqlite', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const pragma of ARCHIVE_PRAGMAS) db.exec(pragma);
    db.exec(archiveBootstrapSql(123));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
    for (const table of ['sessions', 'turns', 'context_samples', 'token_samples', 'tool_events', 'session_events', 'resource_usage', 'ingest_state', 'archive_suppressions', 'archive_meta', 'schema_migrations']) {
      assert.ok(tables.includes(table), `missing table ${table}`);
    }
    assert.equal(db.prepare('SELECT schema_version FROM archive_meta WHERE singleton_id = 1').get().schema_version, ARCHIVE_SCHEMA_VERSION);
  } finally {
    db.close();
  }
});
