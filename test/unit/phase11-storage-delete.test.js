import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSessionStorageSummary, summarizeSelectedSessions } from '../../src/manager/storage-summary.js';
import { deleteSelectedSessions, isPathInsideRoot, validateSessionDeleteCandidate } from '../../src/manager/delete-safety.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-'));
}

function writeSession(root, name, bytes = 32) {
  const filePath = path.join(root, `${name}.jsonl`);
  fs.writeFileSync(filePath, 'x'.repeat(bytes));
  const stat = fs.statSync(filePath);
  return { id: filePath, filePath, name, state: 'ENDED', project: 'alpha', sizeBytes: stat.size, fileSizeBytes: stat.size, modifiedAtMs: stat.mtimeMs, createdAtMs: stat.birthtimeMs };
}

const negativeEvidence = () => ({ processKnown: true, processMatch: false });

test('storage summary reports count, size, age/project breakdown and largest sessions', () => {
  const nowMs = Date.UTC(2026, 7, 27, 12, 0, 0);
  const rows = [
    { id: 'a', state: 'ENDED', project: 'alpha', fileSizeBytes: 100, modifiedAtMs: nowMs - 60_000 },
    { id: 'b', state: 'LIVE', project: 'alpha', fileSizeBytes: 300, modifiedAtMs: nowMs - 2 * 86_400_000 },
    { id: 'c', state: 'UNKNOWN', project: 'beta', fileSizeBytes: 50, modifiedAtMs: nowMs - 40 * 86_400_000 }
  ];
  const summary = buildSessionStorageSummary(rows, { nowMs });
  assert.equal(summary.count, 3);
  assert.equal(summary.totalBytes, 450);
  assert.equal(summary.eligibleDeleteCount, 1);
  assert.equal(summary.largest[0].id, 'b');
  assert.deepEqual(summary.byProject.map((item) => [item.label, item.count, item.sizeBytes]), [['alpha', 2, 400], ['beta', 1, 50]]);
  assert.equal(summary.byAge.find((item) => item.label === '<24h').count, 1);
  assert.equal(summary.byAge.find((item) => item.label === '1-7d').count, 1);
  assert.equal(summary.byAge.find((item) => item.label === '31-90d').count, 1);
  assert.deepEqual(summarizeSelectedSessions(rows, new Set(['a', 'c'])), { count: 2, sizeBytes: 150, knownSizeCount: 2, unknownSizeCount: 0 });
});

test('delete selected only and protects LIVE, UNKNOWN and unselected files', () => {
  const root = tempRoot();
  try {
    const ended = writeSession(root, 'ended');
    const live = { ...writeSession(root, 'live'), state: 'LIVE' };
    const unknown = { ...writeSession(root, 'unknown'), state: 'UNKNOWN' };
    const untouched = writeSession(root, 'untouched');
    const report = deleteSelectedSessions([ended, live, unknown, untouched], new Set([ended.id, live.id, unknown.id]), { sessionsPath: root, processEvidence: negativeEvidence });
    assert.equal(report.deleted.length, 1);
    assert.equal(report.deleted[0].id, ended.id);
    assert.equal(report.rejected.find((item) => item.id === live.id).reason, 'live-protected');
    assert.equal(report.rejected.find((item) => item.id === unknown.id).reason, 'active-state-uncertain');
    assert.equal(fs.existsSync(ended.filePath), false);
    assert.equal(fs.existsSync(live.filePath), true);
    assert.equal(fs.existsSync(unknown.filePath), true);
    assert.equal(fs.existsSync(untouched.filePath), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('path escape and process ambiguity are rejected', () => {
  const root = tempRoot();
  const outside = tempRoot();
  try {
    const row = writeSession(outside, 'escape');
    assert.equal(isPathInsideRoot(row.filePath, root), false);
    assert.equal(validateSessionDeleteCandidate(row, { sessionsPath: root, processEvidence: negativeEvidence }).reason, 'path-outside-sessions-root');
    const inside = writeSession(root, 'inside');
    assert.equal(validateSessionDeleteCandidate(inside, { sessionsPath: root, processEvidence: null }).reason, 'process-telemetry-unavailable');
    assert.equal(validateSessionDeleteCandidate(inside, { sessionsPath: root, processEvidence: () => ({ processKnown: false, processMatch: false }) }).reason, 'active-state-uncertain');
    assert.equal(validateSessionDeleteCandidate(inside, { sessionsPath: root, processEvidence: () => ({ processKnown: true, processMatch: true }) }).reason, 'live-process-match');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('changed files are rejected immediately before delete', () => {
  const root = tempRoot();
  try {
    const row = writeSession(root, 'changed', 16);
    fs.appendFileSync(row.filePath, 'changed');
    const report = deleteSelectedSessions([row], new Set([row.id]), { sessionsPath: root, processEvidence: negativeEvidence });
    assert.equal(report.deleted.length, 0);
    assert.equal(report.rejected[0].reason, 'file-changed-before-delete');
    assert.equal(fs.existsSync(row.filePath), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('symlink candidate is rejected when platform permits symlink creation', (t) => {
  const root = tempRoot();
  const outside = tempRoot();
  try {
    const target = writeSession(outside, 'target');
    const link = path.join(root, 'linked.jsonl');
    try { fs.symlinkSync(target.filePath, link, 'file'); } catch { t.skip('symlink creation unavailable in this environment'); return; }
    const stat = fs.statSync(link);
    const row = { id: link, filePath: link, state: 'ENDED', sizeBytes: stat.size, fileSizeBytes: stat.size, modifiedAtMs: stat.mtimeMs };
    assert.equal(validateSessionDeleteCandidate(row, { sessionsPath: root, processEvidence: negativeEvidence }).reason, 'symlink-reparse-risk');
    assert.equal(fs.existsSync(target.filePath), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
