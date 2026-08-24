import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexPtySpawnPlan } from '../../src/platform/pty.js';

test('Windows npm codex.cmd bypasses cmd.exe when official JS launcher exists', () => {
  const codexPath = String.raw`C:\Users\Admin\AppData\Roaming\npm\codex.cmd`;
  const launcher = String.raw`C:\Users\Admin\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js`;
  const execPath = String.raw`C:\Program Files\nodejs\node.exe`;

  const plan = createCodexPtySpawnPlan({
    codexPath,
    args: ['resume'],
    platform: 'win32',
    execPath,
    env: { ComSpec: String.raw`C:\Windows\System32\cmd.exe` },
    existsSync: (candidate) => candidate.toLowerCase() === launcher.toLowerCase()
  });

  assert.equal(plan.kind, 'windows-npm-shim-bypass');
  assert.equal(plan.file, execPath);
  assert.deepEqual(plan.args, [launcher, 'resume']);
});

test('Windows npm shim bypass prefers node.exe beside the shim when present', () => {
  const codexPath = String.raw`C:\Tools\npm\codex.cmd`;
  const launcher = String.raw`C:\Tools\npm\node_modules\@openai\codex\bin\codex.js`;
  const localNode = String.raw`C:\Tools\npm\node.exe`;

  const plan = createCodexPtySpawnPlan({
    codexPath,
    args: [],
    platform: 'win32',
    execPath: String.raw`C:\Elsewhere\node.exe`,
    existsSync: (candidate) => {
      const normalized = candidate.toLowerCase();
      return normalized === launcher.toLowerCase() || normalized === localNode.toLowerCase();
    }
  });

  assert.equal(plan.file, localNode);
  assert.deepEqual(plan.args, [launcher]);
});

test('Windows cmd.exe remains a safe fallback when the launcher cannot be resolved', () => {
  const codexPath = String.raw`C:\Tools\npm\codex.cmd`;
  const comspec = String.raw`C:\Windows\System32\cmd.exe`;

  const plan = createCodexPtySpawnPlan({
    codexPath,
    args: ['--help'],
    platform: 'win32',
    env: { ComSpec: comspec },
    existsSync: () => false
  });

  assert.equal(plan.kind, 'windows-cmd-fallback');
  assert.equal(plan.file, comspec);
  assert.deepEqual(plan.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.match(plan.args[3], /codex\.cmd/i);
  assert.match(plan.args[3], /--help/);
});

test('non-Windows or native executable uses direct PTY spawn', () => {
  const plan = createCodexPtySpawnPlan({
    codexPath: '/usr/local/bin/codex',
    args: ['resume'],
    platform: 'linux'
  });

  assert.equal(plan.kind, 'direct');
  assert.equal(plan.file, '/usr/local/bin/codex');
  assert.deepEqual(plan.args, ['resume']);
});
