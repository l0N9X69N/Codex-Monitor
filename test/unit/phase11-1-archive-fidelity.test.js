import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openArchiveDatabase } from '../../src/archive/database.js';
import { ARCHIVE_SCHEMA_VERSION } from '../../src/archive/constants.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-fidelity-'));
}

test('archive v2 persists cumulative token samples and per-turn cached/reasoning deltas', () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'data');
  const sourcePath = path.join(root, 'session.jsonl');
  const base = 2_500_000_000_000;
  let opened = null;
  try {
    opened = openArchiveDatabase({ dataDir, now: () => base + 20_000 });
    opened.repository.commitChunk({
      source: { filePath: sourcePath, fileIdentity: 'fixture:fidelity:1', size: 1000, mtimeMs: base + 19_000 },
      sessionId: 'thread-fidelity',
      events: [
        { kind: 'session-meta', atMs: base, model: 'gpt-fidelity', sourceOffset: 1 },
        { kind: 'turn-start', atMs: base + 1000, turnId: 't1', sourceOffset: 10 },
        { kind: 'usage', atMs: base + 2000, inputTokens: 100, cachedInputTokens: 20, outputTokens: 10, reasoningTokens: 4, turnInputTokens: 10, turnOutputTokens: 2, contextUsed: 50, contextWindow: 1000, sourceOffset: 100 },
        { kind: 'usage', atMs: base + 3000, inputTokens: 150, cachedInputTokens: 30, outputTokens: 25, reasoningTokens: 7, turnInputTokens: 15, turnOutputTokens: 3, contextUsed: 80, contextWindow: 1000, sourceOffset: 200 },
        { kind: 'tool-start', atMs: base + 3500, rawType: 'function_call', tool: 'exec', callId: 'shell-1', command: 'secret command must not persist', sourceOffset: 250 },
        { kind: 'tool-end', atMs: base + 3600, rawType: 'function_call_output', callId: 'shell-1', status: 'COMPLETED', durationMs: 100, output: 'secret output must not persist', sourceOffset: 260 },
        { kind: 'turn-complete', atMs: base + 4000, turnId: 't1', sourceOffset: 300 },
        { kind: 'turn-start', atMs: base + 5000, turnId: 't2', sourceOffset: 400 },
        { kind: 'usage', atMs: base + 6000, inputTokens: 210, cachedInputTokens: 55, outputTokens: 40, reasoningTokens: 11, turnInputTokens: 20, turnOutputTokens: 4, contextUsed: 100, contextWindow: 1000, sourceOffset: 500 },
        { kind: 'tool-start', atMs: base + 6500, rawType: 'function_call', tool: 'spawn_agent', callId: 'agent-1', sourceOffset: 550 },
        { kind: 'tool-end', atMs: base + 6600, rawType: 'function_call_output', callId: 'agent-1', status: 'COMPLETED', durationMs: 100, sourceOffset: 560 },
        { kind: 'turn-complete', atMs: base + 7000, turnId: 't2', sourceOffset: 600 }
      ],
      commitOffset: 1000
    });

    assert.equal(opened.db.prepare('SELECT schema_version FROM archive_meta WHERE singleton_id = 1').get().schema_version, ARCHIVE_SCHEMA_VERSION);
    assert.equal(opened.repository.count('token_samples'), 3);

    const samples = opened.db.prepare('SELECT * FROM token_samples WHERE session_id = ? ORDER BY source_offset').all('thread-fidelity');
    assert.deepEqual(samples.map((row) => [row.input_tokens, row.cached_tokens, row.output_tokens, row.reasoning_tokens]), [
      [100, 20, 10, 4],
      [150, 30, 25, 7],
      [210, 55, 40, 11]
    ]);

    const turns = opened.db.prepare('SELECT * FROM turns WHERE session_id = ? ORDER BY turn_no').all('thread-fidelity');
    assert.equal(turns.length, 2);
    assert.equal(turns[0].input_tokens, 15);
    assert.equal(turns[0].cached_tokens, 30);
    assert.equal(turns[0].output_tokens, 3);
    assert.equal(turns[0].reasoning_tokens, 7);
    assert.equal(turns[1].input_tokens, 20);
    assert.equal(turns[1].cached_tokens, 25);
    assert.equal(turns[1].output_tokens, 4);
    assert.equal(turns[1].reasoning_tokens, 4);

    const tools = opened.db.prepare('SELECT tool_type, tool_name, sanitized_detail, status FROM tool_events WHERE session_id = ? ORDER BY timestamp').all('thread-fidelity');
    assert.deepEqual(tools.map((row) => row.tool_type), ['shell', 'agent']);
    assert.deepEqual(tools.map((row) => row.tool_name), ['exec', 'spawn_agent']);
    assert.ok(tools.every((row) => row.sanitized_detail === null));
    assert.ok(tools.every((row) => row.status === 'COMPLETED'));
  } finally {
    try { opened?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('opening a legacy archive upgrades schema additively without changing parser checkpoints', () => {
  const root = tempRoot();
  const dataDir = path.join(root, 'data');
  const sourcePath = path.join(root, 'legacy.jsonl');
  let opened = null;
  try {
    opened = openArchiveDatabase({ dataDir, now: () => 2_600_000_000_000 });
    opened.repository.commitChunk({
      source: { filePath: sourcePath, fileIdentity: 'fixture:legacy:1', size: 10, mtimeMs: 2_600_000_000_000 },
      sessionId: 'thread-legacy',
      events: [{ kind: 'session-meta', atMs: 2_599_999_999_000, sourceOffset: 1 }],
      commitOffset: 10
    });
    opened.db.exec('DROP TABLE token_samples;');
    opened.db.prepare('UPDATE archive_meta SET schema_version = 1 WHERE singleton_id = 1').run();
    opened.db.prepare('DELETE FROM schema_migrations WHERE version = 2').run();
    const before = opened.repository.getIngestState(sourcePath);
    opened.close();
    opened = null;

    opened = openArchiveDatabase({ dataDir, now: () => 2_600_000_001_000 });
    const after = opened.repository.getIngestState(sourcePath);
    assert.equal(opened.db.prepare('SELECT schema_version FROM archive_meta WHERE singleton_id = 1').get().schema_version, ARCHIVE_SCHEMA_VERSION);
    assert.equal(opened.db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'token_samples'").get().count, 1);
    assert.equal(opened.db.prepare('SELECT status FROM schema_migrations WHERE version = 2').get().status, 'applied');
    assert.equal(after.committedOffset, before.committedOffset);
    assert.equal(after.parserVersion, before.parserVersion);
  } finally {
    try { opened?.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});
