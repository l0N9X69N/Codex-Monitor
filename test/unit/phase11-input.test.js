import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeManagerInput } from '../../src/manager/input.js';

test('Phase 11 clear uses C while D remains sort direction compatible', () => {
  assert.equal(normalizeManagerInput('c'), 'delete-selected');
  assert.equal(normalizeManagerInput('C'), 'delete-selected');
  assert.equal(normalizeManagerInput('d'), 'direction');
  assert.equal(normalizeManagerInput('D'), 'direction');
  assert.equal(normalizeManagerInput('r'), 'direction');
  assert.equal(normalizeManagerInput('R'), 'direction');
});

test('clear confirmation accepts Y and cancels with N Q or Escape', () => {
  assert.equal(normalizeManagerInput('y', { confirmingDelete: true }), 'delete-confirm');
  assert.equal(normalizeManagerInput('Y', { confirmingDelete: true }), 'delete-confirm');
  assert.equal(normalizeManagerInput('n', { confirmingDelete: true }), 'delete-cancel');
  assert.equal(normalizeManagerInput('N', { confirmingDelete: true }), 'delete-cancel');
  assert.equal(normalizeManagerInput('q', { confirmingDelete: true }), 'delete-cancel');
  assert.equal(normalizeManagerInput('\x1b', { confirmingDelete: true }), 'delete-cancel');
  assert.equal(normalizeManagerInput('c', { confirmingDelete: true }), null);
});
