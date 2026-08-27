import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openArchiveDatabase, openArchiveDatabaseReadOnly } from '../../src/archive/database.js';
import { publishManagerArchiveConfig } from '../../src/manager/archive-config-state.js';
import { ManagerArchiveVerifiedIndex } from '../../src/manager/archive-verified-index.js';

function config(enabled) {
  return { archive: { enabled } };
}

test('Manager archive index hot-applies OFF/ON config revisions without process restart', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-hot-archive-'));
  const dataDir = path.join(root, 'data');
  const sourcePath = path.join(root, 'session.jsonl');
  let writer = null;
  let index = null;
  try {
    writer = openArchiveDatabase({ dataDir });
    writer.repository.commitChunk({
      source: { filePath: sourcePath, fileIdentity: 'fixture:hot:1', size: 0, mtimeMs: 1 },
      sessionId: 'thread-hot-config',
      events: [],
      commitOffset: 0
    });
    writer.close();
    writer = null;

    let opens = 0;
    index = new ManagerArchiveVerifiedIndex({
      config: config(false),
      sessionsPath: root,
      openDatabase() {
        opens += 1;
        return openArchiveDatabaseReadOnly({ dataDir });
      },
      scanSourcesWithHealth: async () => ({ sources: [], complete: true, errors: [], limited: false })
    });

    assert.equal(index.enabled, false);
    assert.equal(index.open().available, false);
    assert.equal(opens, 0);

    publishManagerArchiveConfig(config(true));
    assert.equal(index.enabled, true);
    const enabledSnapshot = index.open();
    assert.equal(enabledSnapshot.available, true);
    assert.equal(enabledSnapshot.enabled, true);
    assert.equal(opens, 1);

    publishManagerArchiveConfig(config(false));
    assert.equal(index.enabled, false);
    assert.equal(index.opened, null);
    assert.equal(index.lastSnapshot.available, false);
    assert.equal(index.lastSnapshot.rows.length, 0);

    publishManagerArchiveConfig(config(true));
    const reopened = await index.refresh();
    assert.equal(reopened.enabled, true);
    assert.equal(reopened.available, true);
    assert.equal(opens, 2);
  } finally {
    try { index?.close(); } catch {}
    try { writer?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('new Manager archive index ignores config revisions published before construction', () => {
  publishManagerArchiveConfig(config(true));
  const index = new ManagerArchiveVerifiedIndex({
    config: config(false),
    sessionsPath: path.resolve('/virtual/no-hot-leak'),
    openDatabase() { throw new Error('must stay disabled'); },
    scanSourcesWithHealth: async () => ({ sources: [], complete: true, errors: [], limited: false })
  });
  assert.equal(index.enabled, false);
  assert.equal(index.open().available, false);
});
