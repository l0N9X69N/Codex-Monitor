import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { getArchiveDatabasePath, openArchiveDatabase, openArchiveDatabaseReadOnly } from '../../src/archive/database.js';
import { monitorDataDir } from '../../src/platform/common.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('archive runtime requires built-in node:sqlite baseline', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(packageJson.engines.node, '>=22.13 <27');
});

test('archive data directory follows OS data semantics with explicit override support', () => {
  assert.equal(
    monitorDataDir({ env: { LOCALAPPDATA: '/local' }, platform: 'win32', homedir: '/home/u' }),
    path.join('/local', 'codex-monitor')
  );
  assert.equal(
    monitorDataDir({ env: {}, platform: 'darwin', homedir: '/Users/u' }),
    path.join('/Users/u', 'Library', 'Application Support', 'codex-monitor')
  );
  assert.equal(
    monitorDataDir({ env: { XDG_DATA_HOME: '/data' }, platform: 'linux', homedir: '/home/u' }),
    path.join('/data', 'codex-monitor')
  );
  assert.equal(
    monitorDataDir({ env: { CODEXM_DATA_HOME: '/override' }, platform: 'linux', homedir: '/home/u' }),
    path.resolve('/override')
  );
});

test('computing archive path is side-effect free and uses a dedicated local SQLite file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-db-path-'));
  try {
    const dataDir = path.join(root, 'nested', 'data');
    const filePath = getArchiveDatabasePath({ dataDir });
    assert.equal(filePath, path.join(path.resolve(dataDir), 'archive.sqlite3'));
    assert.equal(fs.existsSync(dataDir), false);
    assert.equal(fs.existsSync(filePath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('node:sqlite bootstrap creates a durable WAL archive and migration metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-db-'));
  const dataDir = path.join(root, 'data');
  const sourcePath = path.join(root, 'session.jsonl');
  const now = () => 1_800_000_000_000;
  let opened = null;
  let reopened = null;

  try {
    opened = openArchiveDatabase({ dataDir, now });
    assert.equal(opened.filePath, path.join(path.resolve(dataDir), 'archive.sqlite3'));
    assert.equal(fs.existsSync(opened.filePath), true);
    assert.equal(opened.db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    assert.equal(opened.db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.equal(opened.db.prepare('SELECT schema_version FROM archive_meta WHERE singleton_id = 1').get().schema_version, 1);
    assert.equal(opened.db.prepare('SELECT status FROM schema_migrations WHERE version = 1').get().status, 'applied');

    opened.repository.commitChunk({
      source: {
        filePath: sourcePath,
        fileIdentity: 'fixture:1',
        size: 0,
        mtimeMs: now()
      },
      sessionId: 'thread-durable',
      events: [],
      commitOffset: 0
    });
    opened.close();
    opened.close();
    opened = null;

    reopened = openArchiveDatabase({ dataDir, now });
    assert.equal(reopened.repository.getSession('thread-durable').sessionId, 'thread-durable');
    assert.equal(reopened.repository.getIngestState(sourcePath).sessionId, 'thread-durable');
  } finally {
    try { reopened?.close(); } catch {}
    try { opened?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Manager archive database handle is read-only and never creates a missing archive', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-db-ro-'));
  const dataDir = path.join(root, 'data');
  const missingDir = path.join(root, 'missing', 'nested');
  let writer = null;
  let reader = null;
  try {
    writer = openArchiveDatabase({ dataDir });
    writer.repository.commitChunk({
      source: { filePath: path.join(root, 'session.jsonl'), fileIdentity: 'fixture:ro', size: 0, mtimeMs: Date.now() },
      sessionId: 'thread-read-only',
      events: [],
      commitOffset: 0
    });
    writer.close();
    writer = null;

    reader = openArchiveDatabaseReadOnly({ dataDir });
    assert.equal(reader.repository.getSession('thread-read-only').sessionId, 'thread-read-only');
    assert.throws(() => reader.db.exec('CREATE TABLE manager_must_not_write (id INTEGER);'));
    reader.close();
    reader = null;

    assert.equal(fs.existsSync(missingDir), false);
    assert.throws(() => openArchiveDatabaseReadOnly({ dataDir: missingDir }));
    assert.equal(fs.existsSync(missingDir), false);
  } finally {
    try { reader?.close(); } catch {}
    try { writer?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});
