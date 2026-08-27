import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ArchiveRepository } from '../../src/archive/repository.js';
import { reconcileArchiveSource } from '../../src/archive/reconcile.js';
import { readCommittedJsonlChunk } from '../../src/archive/source-reader.js';

function fixture(contents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-oversize-'));
  const filePath = path.join(root, 'session.jsonl');
  fs.writeFileSync(filePath, contents);
  return { root, filePath };
}

function metaLine() {
  return `${JSON.stringify({
    timestamp: '2026-08-27T07:00:00.000Z',
    type: 'session_meta',
    payload: { id: 'thread-oversize', cwd: 'C:/repo/oversize', model: 'gpt-test' }
  })}\n`;
}

test('archive reader expands beyond soft chunk budget for a valid large JSONL record', async () => {
  const payload = 'x'.repeat(300 * 1024);
  const line = `${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: payload } })}\n`;
  const { root, filePath } = fixture(line);
  try {
    const result = await readCommittedJsonlChunk(filePath, {
      maxBytes: 64 * 1024,
      maxRecordBytes: 512 * 1024,
      maxOversizeScanBytes: 512 * 1024
    });
    assert.equal(result.lines.length, 1);
    assert.equal(result.expandedRecord, true);
    assert.equal(result.oversizedLineCount, 0);
    assert.equal(result.commitCandidateOffset, fs.statSync(filePath).size);
    assert.equal(result.highWaterVerified, true);
    assert.equal(JSON.parse(result.lines[0].text).payload.message.length, payload.length);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('extreme oversized JSONL record advances in bounded discard chunks instead of stalling', async () => {
  const line = `${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'y'.repeat(900 * 1024) } })}\n`;
  const { root, filePath } = fixture(line);
  try {
    const size = fs.statSync(filePath).size;
    let offset = 0;
    let iterations = 0;
    let sawDiscardMarker = false;

    while (offset < size && iterations < 10) {
      const result = await readCommittedJsonlChunk(filePath, {
        committedOffset: offset,
        maxBytes: 64 * 1024,
        maxRecordBytes: 128 * 1024,
        maxOversizeScanBytes: 256 * 1024
      });
      assert.ok(result.commitCandidateOffset > offset, `reader stalled at ${offset}`);
      sawDiscardMarker ||= result.lines.some((entry) => entry.oversized === true);
      offset = result.commitCandidateOffset;
      iterations += 1;
    }

    assert.equal(offset, size);
    assert.ok(sawDiscardMarker);
    assert.ok(iterations > 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reconcile checkpoints oversized discard markers atomically once session identity is known', async () => {
  const oversized = `${JSON.stringify({
    timestamp: '2026-08-27T07:00:01.000Z',
    type: 'event_msg',
    payload: { type: 'user_message', message: 'z'.repeat(900 * 1024) }
  })}\n`;
  const { root, filePath } = fixture(metaLine() + oversized);
  const db = new DatabaseSync(':memory:');
  const repository = new ArchiveRepository(db, { now: () => 1_800_000_000_000 }).initialize();
  const boundedRead = (target, options) => readCommittedJsonlChunk(target, {
    ...options,
    maxRecordBytes: 128 * 1024,
    maxOversizeScanBytes: 256 * 1024
  });

  try {
    let previousOffset = 0;
    let iterations = 0;
    while (repository.getIngestState(filePath)?.committedOffset !== fs.statSync(filePath).size && iterations < 12) {
      const result = await reconcileArchiveSource({
        filePath,
        repository,
        maxBytes: 64 * 1024,
        readChunk: boundedRead
      });
      const currentOffset = repository.getIngestState(filePath)?.committedOffset ?? 0;
      assert.ok(currentOffset > previousOffset, `reconcile stalled at ${previousOffset} (${result.reason ?? result.state})`);
      previousOffset = currentOffset;
      iterations += 1;
    }

    assert.equal(repository.getIngestState(filePath).committedOffset, fs.statSync(filePath).size);
    assert.ok(db.prepare("SELECT COUNT(*) AS count FROM session_events WHERE type = 'archive_parse_error'").get().count >= 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
