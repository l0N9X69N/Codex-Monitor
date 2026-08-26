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

test('non-selected sessions stay shallow while selected session alone triggers deep read', () => {
  const root = tempDir();
  for (let i = 0; i < 20; i += 1) {
    fs.writeFileSync(path.join(root, `s-${i}.jsonl`), sampleSession(`thread-${i}`));
  }

  let fullReads = 0;
  const fsRef = {
    ...fs,
    readFileSync(...args) { fullReads += 1; return fs.readFileSync(...args); }
  };
  const core = new SessionManagerCore({ sessionsPath: root, fsRef, identityEnrichLimit: 4 });
  const items = core.discover();

  assert.equal(fullReads, 0, 'global discovery must never deep read session bodies');
  assert.equal(core.deep.cache.size, 0);
  assert.ok(items.every((item) => item.parsed === false));

  core.select(items[0].id);
  assert.equal(fullReads, 1, 'selecting one session should deep read exactly that session');
  assert.equal(core.deep.cache.size, 1);
  assert.equal(items.filter((item) => item.parsed).length, 1);

  core.refreshKnown();
  assert.equal(fullReads, 1, 'non-selected refresh must not deep read additional sessions');

  fs.rmSync(root, { recursive: true, force: true });
});
