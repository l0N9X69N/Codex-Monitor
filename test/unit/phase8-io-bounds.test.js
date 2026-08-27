import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionManagerCore } from '../../src/manager/session-core.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p8-io-'));
}

function line(obj) {
  return `${JSON.stringify(obj)}\n`;
}

function sampleSession(id) {
  return [
    line({ type: 'session_meta', timestamp: '2026-08-25T00:00:00Z', payload: { id, model: 'gpt-x', cwd: `C:/repo/${id}` } }),
    line({ type: 'turn_started', timestamp: '2026-08-25T00:00:01Z', payload: { id: 'turn-1' } }),
    line({ type: 'turn_complete', timestamp: '2026-08-25T00:00:02Z', payload: { id: 'turn-1' } })
  ].join('');
}

test('1000+ session discovery bounds shallow identity reads and does not retry unchanged failed probes', () => {
  const root = tempDir();
  for (let i = 0; i < 1001; i += 1) {
    fs.writeFileSync(path.join(root, `s-${String(i).padStart(4, '0')}.jsonl`), '');
  }

  let opens = 0;
  let shallowReads = 0;
  let fullReads = 0;
  const fsRef = {
    ...fs,
    openSync(...args) { opens += 1; return fs.openSync(...args); },
    readSync(...args) { shallowReads += 1; return fs.readSync(...args); },
    readFileSync(...args) { fullReads += 1; return fs.readFileSync(...args); }
  };

  const core = new SessionManagerCore({
    sessionsPath: root,
    fsRef,
    identityEnrichLimit: 16
  });

  const index = core.discover();
  assert.equal(index.length, 1001);
  assert.equal(fullReads, 0);
  assert.ok(opens <= 16, `identity opens must be bounded, got ${opens}`);
  assert.ok(shallowReads <= 16, `identity reads must be bounded, got ${shallowReads}`);

  const opensAfterDiscovery = opens;
  const readsAfterDiscovery = shallowReads;
  core.refreshKnown();
  core.refreshKnown();
  assert.equal(opens, opensAfterDiscovery, 'unchanged empty files must not be re-probed every refresh');
  assert.equal(shallowReads, readsAfterDiscovery, 'unchanged empty files must not be re-read every refresh');
  assert.equal(fullReads, 0);

  fs.rmSync(root, { recursive: true, force: true });
});

test('fast known-session refresh stats only the bounded recent set plus explicit active ids', () => {
  const root = tempDir();
  for (let i = 0; i < 1001; i += 1) {
    fs.writeFileSync(path.join(root, `s-${String(i).padStart(4, '0')}.jsonl`), '');
  }

  let stats = 0;
  const fsRef = {
    ...fs,
    statSync(...args) { stats += 1; return fs.statSync(...args); }
  };
  const core = new SessionManagerCore({ sessionsPath: root, fsRef, identityEnrichLimit: 0 });
  core.discover({ enrichIdentity: false });
  assert.equal(core.index.length, 1001);

  stats = 0;
  const extraId = core.index[500].id;
  core.refreshKnown({ limit: 16, ids: new Set([extraId]) });
  assert.ok(stats <= 17, `fast refresh must stat at most 16 recent sessions plus explicit ids, got ${stats}`);
  assert.ok(stats >= 16, `fast refresh should cover the bounded recent set, got ${stats}`);

  fs.rmSync(root, { recursive: true, force: true });
});

test('non-selected sessions stay shallow while selected session alone triggers deep stream reads', () => {
  const root = tempDir();
  for (let i = 0; i < 20; i += 1) {
    fs.writeFileSync(path.join(root, `s-${i}.jsonl`), sampleSession(`thread-${i}`));
  }

  let streamReads = 0;
  let fullReads = 0;
  const fsRef = {
    ...fs,
    readSync(...args) { streamReads += 1; return fs.readSync(...args); },
    readFileSync(...args) { fullReads += 1; return fs.readFileSync(...args); }
  };
  const core = new SessionManagerCore({ sessionsPath: root, fsRef, identityEnrichLimit: 4 });
  const items = core.discover();
  const readsAfterDiscovery = streamReads;

  assert.equal(fullReads, 0, 'global discovery must never whole-file read session bodies');
  assert.equal(core.deep.cache.size, 0);
  assert.ok(items.every((item) => item.parsed === false));

  core.select(items[0].id);
  assert.ok(streamReads > readsAfterDiscovery, 'selecting one session should stream-read that session');
  assert.equal(fullReads, 0, 'selected deep parser must remain bounded-stream based');
  assert.equal(core.deep.cache.size, 1);
  assert.equal(items.filter((item) => item.parsed).length, 1);

  const readsAfterSelect = streamReads;
  core.refreshKnown();
  assert.equal(streamReads, readsAfterSelect, 'non-selected refresh must not deep read additional sessions');
  assert.equal(fullReads, 0);

  fs.rmSync(root, { recursive: true, force: true });
});
