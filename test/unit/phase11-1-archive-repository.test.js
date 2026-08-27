import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveRepository } from '../../src/archive/repository.js';
import { reconcileArchiveSource } from '../../src/archive/reconcile.js';
import { ARCHIVE_SYNC_STATE } from '../../src/archive/constants.js';

function jsonl(lines) {
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase11-1-repo-'));
  const filePath = path.join(root, 'session.jsonl');
  return { root, filePath };
}

async function openRepository(_t, now = () => 1_800_000_000_000) {
  const db = new DatabaseSync(':memory:');
  const repository = new ArchiveRepository(db, { now }).initialize();
  return { db, repository };
}

const meta = {
  timestamp: '2026-08-27T01:00:00.000Z',
  type: 'session_meta',
  payload: { id: 'thread-1', cwd: 'C:/repo/demo', model: 'gpt-test' }
};
const turn = {
  timestamp: '2026-08-27T01:00:01.000Z',
  type: 'turn_started',
  payload: { turn_id: 't1' }
};
const usage = {
  timestamp: '2026-08-27T01:00:02.000Z',
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: {
      total_token_usage: {
        input_tokens: 100,
        cached_input_tokens: 40,
        output_tokens: 20,
        reasoning_output_tokens: 5
      },
      last_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: 60 },
      model_context_window: 1000
    }
  }
};
const toolStart = {
  timestamp: '2026-08-27T01:00:03.000Z',
  type: 'exec_command_begin',
  payload: { call_id: 'c1', name: 'exec', command: 'echo should-not-be-archived' }
};
const toolEnd = {
  timestamp: '2026-08-27T01:00:04.000Z',
  type: 'exec_command_end',
  payload: { call_id: 'c1', status: 'completed', duration_ms: 20, output: 'should-not-be-archived' }
};
const errorEvent = {
  timestamp: '2026-08-27T01:00:05.000Z',
  type: 'error',
  payload: { message: 'boom' }
};
const done = {
  timestamp: '2026-08-27T01:00:06.000Z',
  type: 'turn_complete',
  payload: { turn_id: 't1' }
};

test('reconcile commits derived rows and checkpoint together without transcript/tool output', async (t) => {
  const opened = await openRepository(t);
  const { db, repository } = opened;
  const { root, filePath } = fixture();
  try {
    fs.writeFileSync(filePath, jsonl([
      meta,
      { timestamp: '2026-08-27T01:00:00.500Z', type: 'event_msg', payload: { type: 'user_message', message: 'private prompt text' } },
      turn,
      usage,
      toolStart,
      toolEnd,
      errorEvent,
      done
    ]));

    const result = await reconcileArchiveSource({ filePath, repository, maxBytes: 1024 * 1024 });
    assert.equal(result.state, ARCHIVE_SYNC_STATE.READY);
    assert.equal(result.committedOffset, fs.statSync(filePath).size);
    assert.equal(repository.getIngestState(filePath).committedOffset, fs.statSync(filePath).size);

    const session = repository.getSession('thread-1');
    assert.equal(session.project, 'demo');
    assert.equal(session.turnCount, 1);
    assert.equal(session.toolCount, 1);
    assert.equal(session.errorCount, 1);
    assert.equal(session.inputTokens, 100);
    assert.equal(session.contextCurrent, 60);
    assert.equal(repository.count('turns'), 1);
    assert.equal(repository.count('tool_events'), 1);
    assert.equal(repository.count('context_samples'), 1);
    assert.equal(db.prepare('SELECT sanitized_detail FROM tool_events').get().sanitized_detail, null);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM session_events WHERE type = 'error'").get().count, 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('derived write failure rolls back both derived rows and committed offset', async (t) => {
  const opened = await openRepository(t);
  const { db, repository } = opened;
  const { root, filePath } = fixture();
  try {
    fs.writeFileSync(filePath, jsonl([meta, errorEvent]));
    db.exec("CREATE TRIGGER fail_events BEFORE INSERT ON session_events BEGIN SELECT RAISE(ABORT, 'forced failure'); END;");
    await assert.rejects(() => reconcileArchiveSource({ filePath, repository, maxBytes: 1024 * 1024 }), /forced failure/);
    assert.equal(repository.getIngestState(filePath), null);
    assert.equal(repository.getSession('thread-1'), null);

    db.exec('DROP TRIGGER fail_events;');
    const second = await reconcileArchiveSource({ filePath, repository, maxBytes: 1024 * 1024 });
    assert.equal(second.state, ARCHIVE_SYNC_STATE.READY);
    assert.equal(repository.getIngestState(filePath).committedOffset, fs.statSync(filePath).size);
    assert.equal(repository.getSession('thread-1').errorCount, 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('partial final line does not move checkpoint until newline arrives', async (t) => {
  const opened = await openRepository(t);
  const { db, repository } = opened;
  const { root, filePath } = fixture();
  try {
    const first = jsonl([meta]);
    fs.writeFileSync(filePath, `${first}{"timestamp":"2026-08-27T01:00:01.000Z","type":"turn_started","payload":{"turn_id":"t1"}`);

    const initial = await reconcileArchiveSource({ filePath, repository, maxBytes: 1024 * 1024 });
    assert.equal(initial.state, ARCHIVE_SYNC_STATE.CATCHING_UP);
    assert.equal(repository.getIngestState(filePath).committedOffset, Buffer.byteLength(first));

    fs.appendFileSync(filePath, '}\n');
    const next = await reconcileArchiveSource({ filePath, repository, maxBytes: 1024 * 1024 });
    assert.equal(next.state, ARCHIVE_SYNC_STATE.READY);
    assert.equal(repository.getSession('thread-1').turnCount, 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('complete malformed line is recorded as archive parse error and checkpoint can advance', async (t) => {
  const opened = await openRepository(t);
  const { db, repository } = opened;
  const { root, filePath } = fixture();
  try {
    fs.writeFileSync(filePath, `${jsonl([meta])}{not-json}\n`);
    const result = await reconcileArchiveSource({ filePath, repository, maxBytes: 1024 * 1024 });
    assert.equal(result.state, ARCHIVE_SYNC_STATE.READY);
    assert.equal(result.parseErrorCount, 1);
    assert.equal(repository.getIngestState(filePath).committedOffset, fs.statSync(filePath).size);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM session_events WHERE type = 'archive_parse_error'").get().count, 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing raw source preserves archive and marks session ARCHIVED', async (t) => {
  const opened = await openRepository(t);
  const { db, repository } = opened;
  const { root, filePath } = fixture();
  try {
    fs.writeFileSync(filePath, jsonl([meta]));
    await reconcileArchiveSource({ filePath, repository, maxBytes: 1024 });
    fs.unlinkSync(filePath);

    const result = await reconcileArchiveSource({ filePath, repository, maxBytes: 1024 });
    assert.equal(result.state, ARCHIVE_SYNC_STATE.ARCHIVED);
    const session = repository.getSession('thread-1');
    assert.equal(session.state, 'ARCHIVED');
    assert.equal(session.rawSourceExists, 0);
    assert.equal(session.sourcePath, null);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('empty new raw source stays UNINDEXED rather than claiming READY', async (t) => {
  const opened = await openRepository(t);
  const { db, repository } = opened;
  const { root, filePath } = fixture();
  try {
    fs.writeFileSync(filePath, '');
    const result = await reconcileArchiveSource({ filePath, repository, maxBytes: 1024 });
    assert.equal(result.state, ARCHIVE_SYNC_STATE.UNINDEXED);
    assert.equal(repository.getIngestState(filePath), null);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
