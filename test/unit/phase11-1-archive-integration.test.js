import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { kickArchiveService } from '../../src/archive/integration.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function hookDeps({ complete = true, installResult = { installed: true, changed: true } } = {}) {
  return {
    inspectHooks() { return { installed: complete, complete, error: null }; },
    installHooks() { return installResult; }
  };
}

test('archive integration does not touch hooks or service control when archive is disabled', () => {
  let calls = 0;
  const result = kickArchiveService({ archive: { enabled: false } }, {
    inspectHooks() { calls += 1; throw new Error('must not run'); },
    installHooks() { calls += 1; throw new Error('must not run'); },
    ensureService() { calls += 1; throw new Error('must not run'); }
  });

  assert.equal(calls, 0);
  assert.deepEqual(result, {
    attempted: false,
    started: false,
    running: false,
    reason: 'archive-disabled',
    error: null
  });
});

test('archive integration leaves complete hooks untouched and starts or wakes enabled service', () => {
  let received = null;
  let installs = 0;
  const config = { archive: { enabled: true } };
  const result = kickArchiveService(config, {
    inspectHooks() { return { installed: true, complete: true, error: null }; },
    installHooks() { installs += 1; throw new Error('complete hook must not be rewritten'); },
    ensureService(options) {
      received = options;
      return { started: false, running: true, reason: 'already-running' };
    }
  });

  assert.equal(installs, 0);
  assert.equal(received.config, config);
  assert.deepEqual(result, {
    attempted: true,
    error: null,
    started: false,
    running: true,
    reason: 'already-running'
  });
});

test('archive integration repairs missing or partial hooks before waking SQLite service', () => {
  const order = [];
  const config = { archive: { enabled: true } };
  const result = kickArchiveService(config, {
    inspectHooks() { order.push('inspect'); return { installed: true, complete: false, error: null }; },
    installHooks() { order.push('install'); return { installed: true, changed: true, error: null }; },
    ensureService() { order.push('service'); return { started: true, running: true, reason: 'spawned' }; }
  });

  assert.deepEqual(order, ['inspect', 'install', 'service']);
  assert.equal(result.started, true);
  assert.equal(result.running, true);
});

test('hook inspection or repair failure never blocks SQLite service wake', () => {
  let services = 0;
  const result = kickArchiveService({ archive: { enabled: true } }, {
    inspectHooks() { throw new Error('hooks unreadable'); },
    installHooks() { throw new Error('must not be reached after inspect throw'); },
    ensureService() {
      services += 1;
      return { started: false, running: true, reason: 'already-running' };
    }
  });

  assert.equal(services, 1);
  assert.equal(result.running, true);
  assert.equal(result.error, null);
});

test('archive service control failure never escapes into Manager or Codex launch path', () => {
  const result = kickArchiveService({ archive: { enabled: true } }, {
    ...hookDeps(),
    ensureService() {
      throw new Error('lock unavailable');
    }
  });

  assert.equal(result.attempted, true);
  assert.equal(result.started, false);
  assert.equal(result.running, false);
  assert.equal(result.reason, 'service-control-failed');
  assert.equal(result.error, 'lock unavailable');
});

test('CLI wires archive self-heal/service kick into Manager and official Codex launch paths', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'cli', 'codexm.js'), 'utf8');
  const calls = source.match(/kickArchiveService\(config\);/g) ?? [];
  assert.equal(calls.length, 2);
  assert.match(source, /if \(parsed\.action === 'manager'\) \{\s+kickArchiveService\(config\);/);
  assert.match(source, /const codexPath = resolveCodexExecutable\(\);[\s\S]*?if \(!codexPath\)[\s\S]*?return 2;[\s\S]*?kickArchiveService\(config\);/);
});
