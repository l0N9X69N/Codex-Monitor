import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeManagerInput, nextManagerView, resetManagerInputFraming } from '../../src/manager/input.js';

test('Manager dashboard C opens Config while Storage C deletes and D cycles delete scope', () => {
  resetManagerInputFraming();
  assert.equal(normalizeManagerInput('c'), 'config-view');
  assert.equal(normalizeManagerInput('C'), 'config-view');
  assert.equal(normalizeManagerInput('c', { storageOpen: true }), 'delete-selected');
  assert.equal(normalizeManagerInput('C', { storageOpen: true }), 'delete-selected');
  assert.equal(normalizeManagerInput('d', { storageOpen: true }), 'delete-scope');
  assert.equal(normalizeManagerInput('D', { storageOpen: true }), 'delete-scope');
  assert.equal(normalizeManagerInput('d'), 'direction');
  assert.equal(normalizeManagerInput('D'), 'direction');
  assert.equal(normalizeManagerInput('r'), 'direction');
  assert.equal(normalizeManagerInput('R'), 'direction');
});

test('delete confirmation accepts Y and cancels with N Q or Escape', () => {
  resetManagerInputFraming();
  assert.equal(normalizeManagerInput('y', { confirmingDelete: true }), 'delete-confirm');
  assert.equal(normalizeManagerInput('Y', { confirmingDelete: true }), 'delete-confirm');
  assert.equal(normalizeManagerInput('n', { confirmingDelete: true }), 'delete-cancel');
  assert.equal(normalizeManagerInput('N', { confirmingDelete: true }), 'delete-cancel');
  assert.equal(normalizeManagerInput('q', { confirmingDelete: true }), 'delete-cancel');
  assert.equal(normalizeManagerInput('\x1b', { confirmingDelete: true }), 'delete-cancel');
  assert.equal(normalizeManagerInput('c', { confirmingDelete: true }), null);
});

test('storage uses M while preserving the Phase 9 V view cycle', () => {
  resetManagerInputFraming();
  assert.equal(normalizeManagerInput('m'), 'storage-view');
  assert.equal(normalizeManagerInput('M'), 'storage-view');
  assert.equal(nextManagerView('operations'), 'table');
  assert.equal(nextManagerView('table'), 'charts');
  assert.equal(nextManagerView('charts'), 'auto');
  assert.equal(nextManagerView('auto'), 'operations');
});

test('Config mode owns navigation edit save revert and close keys', () => {
  resetManagerInputFraming();
  const options = { configOpen: true };
  assert.equal(normalizeManagerInput('c', options), 'config-close');
  assert.equal(normalizeManagerInput('q', options), 'config-close');
  assert.equal(normalizeManagerInput('\x1b', options), 'config-close');
  assert.equal(normalizeManagerInput('\t', options), 'config-tab-next');
  assert.equal(normalizeManagerInput('\x1b[D', options), 'config-tab-prev');
  assert.equal(normalizeManagerInput('\r', options), 'config-edit');
  assert.equal(normalizeManagerInput(' ', options), 'config-edit');
  assert.equal(normalizeManagerInput('s', options), 'config-save');
  assert.equal(normalizeManagerInput('r', options), 'config-revert');
});

test('Manager mouse shortcuts leave left click inert, map middle to View, right to Enter, and wheel to navigation', () => {
  resetManagerInputFraming();
  assert.equal(normalizeManagerInput('\x1b[<0;20;10M'), null);
  assert.equal(normalizeManagerInput('\x1b[<1;20;10M'), 'view');
  assert.equal(normalizeManagerInput('\x1b[<2;20;10M'), 'inspect');
  assert.equal(normalizeManagerInput('\x1b[<64;20;10M'), 'up');
  assert.equal(normalizeManagerInput('\x1b[<65;20;10M'), 'down');
  assert.equal(normalizeManagerInput('\x1b[<2;20;10m'), null);
});

test('Manager mouse framing keeps a split trailing M from becoming the Storage shortcut', () => {
  resetManagerInputFraming();
  assert.equal(normalizeManagerInput('\x1b[<2;20;10'), null);
  assert.equal(normalizeManagerInput('M'), 'inspect');

  resetManagerInputFraming();
  assert.equal(normalizeManagerInput('\x1b[<0;20;10'), null);
  assert.equal(normalizeManagerInput('M'), null);
});
