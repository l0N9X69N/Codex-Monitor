import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseMonitorArgs } from '../../src/cli/args.js';
import { PROVENANCE } from '../../src/core/provenance.js';
import { createFakePlatformAdapter } from '../../src/platform/fake.js';
import { HistoryEngine } from '../../src/history/engine.js';
import { runSessionManager } from '../../src/manager/app.js';
import { SessionManagerTracker } from '../../src/manager/tracker.js';
import {
  buildProcessEvidence,
  probeSessionIdentity,
  SessionActivityResolver,
  SessionManagerCore,
  SESSION_ACTIVITY,
  querySessions
} from '../../src/manager/session-core.js';

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p8-')); }
function line(obj) { return `${JSON.stringify(obj)}\n`; }
function sampleSession({ threadId = 'thread-1', cwd = 'C:/repo', model = 'gpt-x' } = {}) {
  return [
    line({ type: 'session_meta', timestamp: '2026-08-25T00:00:00Z', payload: { id: threadId, model, reasoning_effort: 'medium', cwd } }),
    line({ type: 'turn_started', timestamp: '2026-08-25T00:00:01Z', payload: { id: 'turn-1' } }),
    line({ type: 'exec_command_begin', timestamp: '2026-08-25T00:00:02Z', payload: { call_id: 'c1', name: 'shell' } }),
    line({ type: 'exec_command_end', timestamp: '2026-08-25T00:00:03Z', payload: { call_id: 'c1' } }),
    line({ type: 'token_count', timestamp: '2026-08-25T00:00:04Z', payload: { info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 40, reasoning_output_tokens: 5 }, last_token_usage: { total_tokens: 60 }, model_context_window: 200000 } } }),
    line({ type: 'turn_complete', timestamp: '2026-08-25T00:00:05Z', payload: { id: 'turn-1' } })
  ].join('');
}

function captureStream() {
  let text = '';
  return { stream: { write(value) { text += String(value); return true; } }, text: () => text };
}

test('--manager is Monitor-owned while --history is forwarded to official Codex', () => {
  const manager = parseMonitorArgs(['--manager']);
  const history = parseMonitorArgs(['--history']);
  const explicit = parseMonitorArgs(['--', '--history']);
  assert.equal(manager.action, 'manager');
  assert.deepEqual(manager.codexArgs, []);
  assert.equal(history.action, 'run');
  assert.deepEqual(history.codexArgs, ['--history']);
  assert.equal(explicit.action, 'run');
  assert.deepEqual(explicit.codexArgs, ['--history']);
});

test('Session Manager entrypoint discovers local sessions without spawning Codex', async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, 'one.jsonl'), sampleSession());
  const adapter = createFakePlatformAdapter({ paths: { sessions: root }, processTree: [] });
  const output = captureStream();
  const result = await runSessionManager({ platformAdapter: adapter, stdout: output.stream });
  assert.equal(result.code, 0);
  assert.equal(result.items.length, 1);
  assert.match(output.text(), /Session Manager/);
  assert.match(output.text(), /Codex processes:/);
  assert.equal(adapter.calls.some((item) => item.name === 'spawnPty'), false);
  assert.equal(adapter.calls.some((item) => item.name === 'getProcessTree'), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('metadata discovery of 1000+ sessions never full-reads session bodies', () => {
  const root = tempDir();
  for (let i = 0; i < 1001; i += 1) fs.writeFileSync(path.join(root, `s-${String(i).padStart(4, '0')}.jsonl`), '');
  let fullReads = 0;
  const fsRef = { ...fs, readFileSync: (...args) => { fullReads += 1; return fs.readFileSync(...args); } };
  const core = new SessionManagerCore({ sessionsPath: root, fsRef });
  const index = core.discover();
  assert.equal(index.length, 1001);
  assert.equal(fullReads, 0);
  assert.ok(index.every((item) => item.parsed === false));
  fs.rmSync(root, { recursive: true, force: true });
});

test('bounded identity probe extracts thread/cwd/project/model without deep parsing', () => {
  const root = tempDir();
  const file = path.join(root, 'one.jsonl');
  fs.writeFileSync(file, sampleSession({ threadId: 'thread-probe', cwd: 'C:/work/proj', model: 'gpt-probe' }));
  const identity = probeSessionIdentity(file, fs, 1024);
  assert.deepEqual(identity, {
    threadId: 'thread-probe',
    cwd: 'C:/work/proj',
    project: 'proj',
    model: 'gpt-probe',
    startedAtMs: Date.parse('2026-08-25T00:00:00Z')
  });
  const core = new SessionManagerCore({ sessionsPath: root, identityBytes: 1024 });
  const [item] = core.discover();
  assert.equal(item.threadId, 'thread-probe');
  assert.equal(item.project, 'proj');
  assert.equal(item.model, 'gpt-probe');
  assert.equal(item.parsed, false);
  assert.equal(core.deep.cache.size, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('process evidence is conservative when Codex exists but a session cannot be mapped', () => {
  const nowMs = Date.parse('2026-08-25T00:00:20Z');
  const processes = [
    { pid: 10, ppid: 1, name: 'node.exe', command: 'node codex.js resume thread-live', ageMs: 20_000 },
    { pid: 11, ppid: 1, name: 'unrelated.exe', command: 'unrelated', ageMs: 1000 }
  ];
  const evidence = buildProcessEvidence(processes, { nowMs });
  assert.deepEqual(evidence({ threadId: null }), { processKnown: false, processMatch: false });
  assert.deepEqual(evidence({ threadId: 'thread-live' }), { processKnown: true, processMatch: true });
  assert.deepEqual(evidence({ threadId: 'thread-ended' }), { processKnown: false, processMatch: false });
  assert.equal(evidence.diagnostics.codexProcessCount, 1);

  const startSession = {
    id: 'start-session',
    threadId: 'opaque',
    startedAtMs: Date.parse('2026-08-25T00:00:00Z')
  };
  const startEvidence = buildProcessEvidence(processes, { nowMs, sessions: [startSession] });
  assert.deepEqual(startEvidence(startSession), { processKnown: true, processMatch: true });
  assert.equal(startEvidence.diagnostics.startMatchCount, 1);

  const noCodex = buildProcessEvidence([{ pid: 99, name: 'powershell.exe', command: 'powershell.exe' }], { nowMs });
  assert.deepEqual(noCodex({ threadId: 'thread-old' }), { processKnown: true, processMatch: false });

  const unavailable = buildProcessEvidence({ supported: false });
  assert.deepEqual(unavailable({ threadId: 'thread-live' }), { processKnown: false, processMatch: false });
});

test('activity resolver never claims LIVE from mtime alone', () => {
  let nowMs = 10_000;
  const resolver = new SessionActivityResolver({ now: () => nowMs, staleAfterMs: 1000 });
  const recent = { id: 's1', sizeBytes: 100, modifiedAtMs: 9_900 };
  assert.equal(resolver.resolve(recent, {}), SESSION_ACTIVITY.UNKNOWN);
  nowMs = 20_000;
  assert.equal(resolver.resolve({ ...recent, modifiedAtMs: 19_999 }, {}), SESSION_ACTIVITY.UNKNOWN);
});

test('activity resolver accepts growth or process match as LIVE evidence and strong process absence as ENDED', () => {
  let nowMs = 20_000;
  const resolver = new SessionActivityResolver({ now: () => nowMs, staleAfterMs: 1000 });
  const base = { id: 's1', sizeBytes: 100, modifiedAtMs: 10_000 };
  assert.equal(resolver.resolve(base, {}), SESSION_ACTIVITY.UNKNOWN);
  assert.equal(resolver.resolve({ ...base, sizeBytes: 120, modifiedAtMs: 20_000 }, {}), SESSION_ACTIVITY.LIVE);
  assert.equal(resolver.resolve({ id: 's2', sizeBytes: 50, modifiedAtMs: 20_000 }, { processKnown: true, processMatch: true }), SESSION_ACTIVITY.LIVE);
  nowMs = 30_000;
  assert.equal(resolver.resolve({ id: 's3', sizeBytes: 50, modifiedAtMs: 20_000 }, { processKnown: true, processMatch: false }), SESSION_ACTIVITY.ENDED);
});

test('multiple growing sessions update independently and retain LIVE briefly across idle polls', () => {
  const root = tempDir();
  const a = path.join(root, 'a.jsonl');
  const b = path.join(root, 'b.jsonl');
  fs.writeFileSync(a, '');
  fs.writeFileSync(b, '');
  let nowMs = 1000;
  const core = new SessionManagerCore({
    sessionsPath: root,
    now: () => nowMs,
    activityResolver: new SessionActivityResolver({ now: () => nowMs, staleAfterMs: 1000 })
  });
  core.discover();
  core.refreshKnown();
  fs.appendFileSync(a, 'x');
  let items = core.refreshKnown();
  assert.equal(items.find((item) => item.filePath === a).state, SESSION_ACTIVITY.LIVE);
  assert.equal(items.find((item) => item.filePath === b).state, SESSION_ACTIVITY.UNKNOWN);
  nowMs += 500;
  items = core.refreshKnown();
  assert.equal(items.find((item) => item.filePath === a).state, SESSION_ACTIVITY.LIVE);
  fs.appendFileSync(b, 'y');
  items = core.refreshKnown();
  assert.equal(items.find((item) => item.filePath === b).state, SESSION_ACTIVITY.LIVE);
  fs.rmSync(root, { recursive: true, force: true });
});

test('only selected session is deep parsed through bounded stream reads and releaseSelection frees detail cache', () => {
  const root = tempDir();
  const a = path.join(root, 'a.jsonl');
  const b = path.join(root, 'b.jsonl');
  fs.writeFileSync(a, sampleSession({ threadId: 'thread-a', cwd: 'C:/a' }));
  fs.writeFileSync(b, sampleSession({ threadId: 'thread-b', cwd: 'C:/b' }));
  let streamReads = 0;
  let fullReads = 0;
  const fsRef = {
    ...fs,
    readSync: (...args) => { streamReads += 1; return fs.readSync(...args); },
    readFileSync: (...args) => { fullReads += 1; return fs.readFileSync(...args); }
  };
  const core = new SessionManagerCore({ sessionsPath: root, fsRef });
  const items = core.discover();
  const readsAfterDiscovery = streamReads;
  assert.equal(fullReads, 0);
  const selected = core.select(items[0].id);
  assert.ok(streamReads > readsAfterDiscovery, 'selection must stream-read the selected session');
  assert.equal(fullReads, 0, 'deep parser must not fall back to whole-file readFileSync');
  assert.equal(selected.normalized.session.threadId.provenance.source, PROVENANCE.OFFICIAL_HISTORY);
  assert.equal(items.filter((item) => item.parsed).length, 1);
  assert.equal(core.deep.cache.size, 1);
  core.releaseSelection();
  assert.equal(core.selectedId, null);
  assert.equal(core.deep.cache.size, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('selected session tail handles partial append, complete append and no duplicate', () => {
  const root = tempDir();
  const file = path.join(root, 'grow.jsonl');
  fs.writeFileSync(file, sampleSession());
  const core = new SessionManagerCore({ sessionsPath: root });
  const [meta] = core.discover();
  const model = core.select(meta.id);
  const before = model.tools.count;
  const partial = JSON.stringify({ type: 'mcp_tool_call_begin', timestamp: '2026-08-25T00:00:06Z', payload: { call_id: 'm1', name: 'mcp.read' } });
  fs.appendFileSync(file, partial.slice(0, 25));
  assert.equal(core.tailSelected().model.tools.count, before);
  fs.appendFileSync(file, `${partial.slice(25)}\n`);
  assert.equal(core.tailSelected().model.tools.count, before + 1);
  assert.equal(core.tailSelected().changed, false);
  assert.equal(model.tools.count, before + 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('selected session truncation reloads safely and no database is created', () => {
  const root = tempDir();
  const file = path.join(root, 'rotate.jsonl');
  fs.writeFileSync(file, sampleSession());
  const core = new SessionManagerCore({ sessionsPath: root });
  const [meta] = core.discover();
  core.select(meta.id);
  fs.writeFileSync(file, line({ type: 'session_meta', timestamp: '2026-08-25T01:00:00Z', payload: { id: 'thread-new' } }));
  const result = core.tailSelected();
  assert.equal(result.reset, true);
  assert.equal(result.model.info.threadId, 'thread-new');
  assert.equal(fs.readdirSync(root).some((name) => /\.(db|sqlite|csv)$/i.test(name)), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('external delete degrades gracefully and clears missing selection on known refresh', () => {
  const root = tempDir();
  const file = path.join(root, 'gone.jsonl');
  fs.writeFileSync(file, sampleSession());
  const core = new SessionManagerCore({ sessionsPath: root });
  const [meta] = core.discover();
  core.select(meta.id);
  fs.rmSync(file, { force: true });
  const tail = core.tailSelected();
  assert.equal(tail.changed, false);
  assert.ok(tail.error);
  core.refreshKnown();
  assert.equal(core.selectedId, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('tracker separates discovery, process, known refresh and selected-tail cadences', async () => {
  const root = tempDir();
  const file = path.join(root, 'one.jsonl');
  fs.writeFileSync(file, sampleSession({ threadId: 'thread-track' }));
  let nowMs = 0;
  const adapter = createFakePlatformAdapter({
    paths: { sessions: root },
    processTree: [{ pid: 1, ppid: 0, name: 'codex.exe', command: 'codex resume thread-track', ageMs: 0 }]
  });
  const core = new SessionManagerCore({ sessionsPath: root, now: () => nowMs });
  let tailCalls = 0;
  const originalTailSelected = core.tailSelected.bind(core);
  core.tailSelected = () => {
    tailCalls += 1;
    return originalTailSelected();
  };
  const tracker = new SessionManagerTracker({
    core,
    platformAdapter: adapter,
    now: () => nowMs,
    discoveryIntervalMs: 5000,
    processIntervalMs: 2500,
    knownRefreshIntervalMs: 750,
    selectedTailIntervalMs: 500
  });

  let result = await tracker.tick();
  assert.equal(result.discovered, true);
  assert.equal(result.processPolled, true);
  assert.equal(result.processDiagnostics.codexProcessCount, 1);
  assert.equal(core.index.length, 1);
  const processCalls = () => adapter.calls.filter((item) => item.name === 'getProcessTree').length;
  assert.equal(processCalls(), 1);

  nowMs = 400;
  result = await tracker.tick();
  assert.equal(result.discovered, false);
  assert.equal(result.knownRefreshed, false);
  assert.equal(result.processPolled, false);
  assert.equal(processCalls(), 1);

  nowMs = 800;
  result = await tracker.tick();
  assert.equal(result.knownRefreshed, true);
  assert.equal(result.discovered, false);
  assert.equal(processCalls(), 1);

  core.select(core.index[0].id);
  nowMs = 1300;
  result = await tracker.tick();
  assert.equal(tailCalls, 1, 'selected-tail cadence must poll once when due');
  assert.equal(result.selectedTailed, false, 'unchanged tail is not a changed-tail event');
  assert.ok(result.selected);

  nowMs = 2600;
  result = await tracker.tick();
  assert.equal(result.processPolled, true);
  assert.equal(processCalls(), 2);
  assert.equal(tailCalls, 2, 'selected-tail cadence must continue independently of process cadence');

  nowMs = 5000;
  result = await tracker.tick();
  assert.equal(result.discovered, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('query model supports deterministic All/Live/Ended search and sort', () => {
  const items = [
    { id: 'b', project: 'Backend', state: SESSION_ACTIVITY.LIVE, modifiedAtMs: 20 },
    { id: 'a', project: 'App', state: SESSION_ACTIVITY.ENDED, modifiedAtMs: 10 },
    { id: 'c', project: 'Client', state: SESSION_ACTIVITY.UNKNOWN, modifiedAtMs: 30 }
  ];
  assert.deepEqual(querySessions([...items], { scope: 'live' }).map((item) => item.id), ['b']);
  assert.deepEqual(querySessions([...items], { scope: 'ended' }).map((item) => item.id), ['a']);
  assert.deepEqual(querySessions([...items], { search: 'app' }).map((item) => item.id), ['a']);
  assert.deepEqual(querySessions([...items], { sortBy: 'project', direction: 'asc' }).map((item) => item.id), ['a', 'b', 'c']);
});

test('legacy HistoryEngine remains a selected-session parser, not the Manager discovery contract', () => {
  const root = tempDir();
  const file = path.join(root, 'one.jsonl');
  fs.writeFileSync(file, sampleSession());
  const engine = new HistoryEngine({ sessionsPath: root });
  const [meta] = engine.discover();
  const model = engine.ensureLoaded(meta.id);
  assert.equal(model.info.threadId, 'thread-1');
  assert.equal(model.tokens.input, 100);
  assert.equal(model.tools.count, 1);
  fs.rmSync(root, { recursive: true, force: true });
});
