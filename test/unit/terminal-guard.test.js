import test from 'node:test';
import assert from 'node:assert/strict';
import { TerminalGuard } from '../../src/terminal/guard.js';

function fakeTerminal() {
  const writes = [];
  const rawCalls = [];
  return {
    writes,
    rawCalls,
    stdin: {
      isTTY: true,
      isRaw: false,
      setRawMode(value) { this.isRaw = value; rawCalls.push(value); }
    },
    stdout: { write(value) { writes.push(value); } }
  };
}

test('TerminalGuard restores only modes it changed and is idempotent', () => {
  const fake = fakeTerminal();
  const guard = new TerminalGuard(fake);
  guard.enterRawMode();
  guard.hideCursor();
  guard.setScrollRegion(1, 20);
  guard.enableMouse();
  guard.enterAlternateScreen();

  assert.equal(guard.restore(), true);
  assert.equal(guard.restore(), false);
  assert.deepEqual(fake.rawCalls, [true, false]);
  const restored = fake.writes.join('');
  assert.match(restored, /\x1b\[\?25h/);
  assert.match(restored, /\x1b\[r/);
  assert.match(restored, /\x1b\[\?1049l/);
  assert.match(restored, /\x1b\[\?1006l/);
});
