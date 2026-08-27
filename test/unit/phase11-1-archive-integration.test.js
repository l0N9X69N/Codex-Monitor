import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { kickArchiveService } from '../../src/archive/integration.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('archive integration does not touch service control when archive is disabled', () => {
  let calls = 0;
  const result = kickArchiveService({ archive: { enabled: false } }, {
    ensureService() {
      calls += 1;
      throw new Error('must not run');
    }
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

test('archive integration starts or wakes enabled service through one fail-soft boundary', () => {
  let received = null;
  const config = { archive: { enabled: true } };
  const result = kickArchiveService(config, {
    ensureService(options) {
      received = options;
      return { started: false, running: true, reason: 'already-running' };
    }
  });

  assert.equal(received.config, config);
  assert.deepEqual(result, {
    attempted: true,
    error: null,
    started: false,
    running: true,
    reason: 'already-running'
  });
});

test('archive service control failure never escapes into Manager or Codex launch path', () => {
  const result = kickArchiveService({ archive: { enabled: true } }, {
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

test('CLI wires archive kick only into Manager and official Codex launch paths', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'cli', 'codexm.js'), 'utf8');
  const calls = source.match(/kickArchiveService\(config\);/g) ?? [];
  assert.equal(calls.length, 2);
  assert.match(source, /if \(parsed\.action === 'manager'\) \{\s+kickArchiveService\(config\);/);
  assert.match(source, /const codexPath = resolveCodexExecutable\(\);[\s\S]*?if \(!codexPath\)[\s\S]*?return 2;[\s\S]*?kickArchiveService\(config\);/);
});
