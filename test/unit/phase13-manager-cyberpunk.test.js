import test from 'node:test';
import assert from 'node:assert/strict';
import { hpaint, historyTokens } from '../../src/history/theme.js';
import { cellWidth, stripAnsi } from '../../src/ui/cell-width.js';

const TITLES = Object.freeze([
  ['TOKEN BURN', 'cyberCyan'],
  ['CURRENT / LIVE', 'cyberGreen'],
  ['TOP CONTEXT', 'cyberAmber'],
  ['SELECTED SESSION', 'cyberMagenta']
]);

test('default Manager palette exposes distinct cyberpunk semantic accents', () => {
  const tokens = historyTokens('truecolor');
  for (const token of ['cyberCyan', 'cyberMagenta', 'cyberAmber', 'cyberGreen']) {
    assert.match(tokens[token], /^\x1b\[/);
  }
  assert.equal(new Set(TITLES.map(([, token]) => tokens[token])).size, TITLES.length);
  assert.match(tokens.panel, /^\x1b\[/);
  assert.match(tokens.selected, /48;2;/);
});

test('Manager headings choose cyberpunk accents by semantic content without changing cells', () => {
  const tokens = historyTokens('truecolor');
  for (const [title, token] of TITLES) {
    const rendered = hpaint(title, 'heading', 'truecolor');
    assert.ok(rendered.startsWith(tokens[token]), `${title} should use ${token}`);
    assert.equal(stripAnsi(rendered), title);
    assert.equal(cellWidth(rendered), cellWidth(title));
  }
  const manager = hpaint('CODEX // SESSION MANAGER', 'strong', 'truecolor');
  assert.ok(manager.startsWith(tokens.cyberCyan));
});

test('Manager footer highlights command keys while descriptions stay intact', () => {
  const plain = '↑↓ select  Enter inspect  / search  F scope  S sort  D dir  V view  Q/Esc quit';
  const tokens = historyTokens('truecolor');
  const rendered = hpaint(plain, 'dim', 'truecolor');
  assert.equal(stripAnsi(rendered), plain);
  assert.ok(rendered.includes(tokens.cyberCyan));
  assert.ok(rendered.includes(tokens.cyberMagenta));
  assert.equal(cellWidth(rendered), cellWidth(plain));
});

test('mono Manager presentation remains ANSI-free and structurally identical', () => {
  for (const [title] of TITLES) assert.equal(hpaint(title, 'heading', 'mono'), title);
  const footer = '↑↓ select  Enter inspect  / search  V view  Q quit';
  assert.equal(hpaint(footer, 'dim', 'mono'), footer);
  assert.doesNotMatch(hpaint('selected row', 'selected', 'mono'), /\x1b\[/);
});
