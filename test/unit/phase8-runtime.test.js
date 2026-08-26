import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManagerProcessEvidence } from '../../src/manager/process-evidence.js';
import { SessionManagerRuntime } from '../../src/manager/runtime.js';

test('persistent process associations make a disappeared mapped root specific negative evidence', () => {
  const nowMs = 100_000;
  const sessions = [
    { id: 's1', threadId: 'opaque-1', startedAtMs: 90_000 },
    { id: 's2', threadId: 'opaque-2', startedAtMs: 80_000 }
  ];
  const first = buildManagerProcessEvidence([
    { pid: 101, ppid: 1, name: 'codex.exe', command: 'codex', ageMs: 10_000 },
    { pid: 202, ppid: 1, name: 'codex.exe', command: 'codex', ageMs: 20_000 }
  ], { nowMs, sessions });

  assert.deepEqual(first(sessions[0]), { processKnown: true, processMatch: true });
  assert.deepEqual(first(sessions[1]), { processKnown: true, processMatch: true });
  assert.equal(first.diagnostics.mappedSessionCount, 2);

  const second = buildManagerProcessEvidence([
    { pid: 101, ppid: 1, name: 'codex.exe', command: 'codex', ageMs: 12_500 }
  ], {
    nowMs: nowMs + 2_500,
    sessions,
    previousAssociations: first.associations
  });

  assert.deepEqual(second(sessions[0]), { processKnown: true, processMatch: true });
  assert.deepEqual(second(sessions[1]), { processKnown: true, processMatch: false });
  assert.equal(second.diagnostics.stickyMatchCount, 1);
  assert.equal(second.diagnostics.missingAssociationCount, 1);
});

test('SessionManagerRuntime stays alive until stop and emits only changed snapshots', async () => {
  let ticks = 0;
  const tracker = {
    async tick() {
      ticks += 1;
      return {
        sessions: [{ id: 's1', state: 'LIVE' }],
        processDiagnostics: { codexProcessCount: 1, codexRootCount: 1, mappedSessionCount: 1 },
        processError: null
      };
    }
  };
  const snapshots = [];
  let scheduled = null;
  let cleared = null;
  const runtime = new SessionManagerRuntime({
    tracker,
    onSnapshot(result) { snapshots.push(result); },
    setTimeoutRef(callback) { scheduled = callback; return 77; },
    clearTimeoutRef(id) { cleared = id; }
  });

  let resolved = false;
  const running = runtime.start().then(() => { resolved = true; });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(runtime.running, true);
  assert.equal(resolved, false);
  assert.equal(ticks, 1);
  assert.equal(snapshots.length, 1);
  assert.equal(typeof scheduled, 'function');

  const scheduledTick = scheduled;
  scheduled = null;
  await scheduledTick();
  assert.equal(ticks, 2);
  assert.equal(snapshots.length, 1, 'unchanged snapshot must not emit again');
  assert.equal(typeof scheduled, 'function', 'runtime must schedule the next tick');

  runtime.stop();
  await running;
  assert.equal(resolved, true);
  assert.equal(runtime.running, false);
  assert.equal(cleared, 77);
});