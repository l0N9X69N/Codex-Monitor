import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManagerProcessEvidence } from '../../src/manager/process-evidence.js';

function session(id, startedAtMs, threadId = id) {
  return { id, startedAtMs, threadId };
}

function process(pid, ppid, ageMs, command = 'codex') {
  return { pid, ppid, ageMs, name: 'codex.exe', command };
}

test('nearest process starts map one-to-one to indexed sessions', () => {
  const nowMs = 1_000_000;
  const sessions = [
    session('s-a', 900_000, 'thread-a'),
    session('s-b', 800_000, 'thread-b'),
    session('s-old', 100_000, 'thread-old')
  ];
  const evidence = buildManagerProcessEvidence([
    process(10, 1, 99_000),
    process(20, 1, 201_000)
  ], { nowMs, sessions, startToleranceMs: 120_000 });

  assert.deepEqual(evidence(sessions[0]), { processKnown: true, processMatch: true });
  assert.deepEqual(evidence(sessions[1]), { processKnown: true, processMatch: true });
  assert.deepEqual(evidence(sessions[2]), { processKnown: false, processMatch: false });
  assert.equal(evidence.diagnostics.codexRootCount, 2);
  assert.equal(evidence.diagnostics.mappedSessionCount, 2);
  assert.equal(evidence.diagnostics.startMatchCount, 2);
});

test('exact thread-id correlation wins and consumes its Codex root', () => {
  const nowMs = 1_000_000;
  const sessions = [
    session('exact', 899_500, 'thread-exact'),
    session('nearby', 900_100, 'thread-nearby')
  ];
  const evidence = buildManagerProcessEvidence([
    process(10, 1, 100_000, 'codex resume thread-exact')
  ], { nowMs, sessions, startToleranceMs: 120_000 });

  assert.deepEqual(evidence(sessions[0]), { processKnown: true, processMatch: true });
  assert.deepEqual(evidence(sessions[1]), { processKnown: false, processMatch: false });
  assert.equal(evidence.diagnostics.exactMatchCount, 1);
  assert.equal(evidence.diagnostics.startMatchCount, 0);
  assert.equal(evidence.diagnostics.mappedSessionCount, 1);
});

test('zero Codex processes is negative evidence but unmapped active Codex is not', () => {
  const item = session('s1', 900_000, 'thread-s1');
  const none = buildManagerProcessEvidence([], { nowMs: 1_000_000, sessions: [item] });
  assert.deepEqual(none(item), { processKnown: true, processMatch: false });

  const unmapped = buildManagerProcessEvidence([
    process(10, 1, 10_000, 'codex')
  ], { nowMs: 1_000_000, sessions: [item], startToleranceMs: 1000 });
  assert.deepEqual(unmapped(item), { processKnown: false, processMatch: false });
});
