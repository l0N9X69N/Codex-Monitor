import test from 'node:test';
import assert from 'node:assert/strict';
import { PtyTransientTracker } from '../src/transient.js';

const toolState = {
  meta: {
    activityState: 'TOOL',
    activityAtMs: 1,
    lastEventAtMs: 1,
    errorCount: 0,
    activeToolIds: ['1']
  }
};

test('approval split across PTY chunks is detected', () => {
  const tracker = new PtyTransientTracker();
  tracker.feedOutput('Would you like to run the following ', 1000);
  tracker.feedOutput('command?', 1100);
  const state = tracker.overlayState(toolState, 1100);
  assert.equal(state.meta.activityState, 'APPROVAL');
  assert.equal(state.meta.activitySource, 'pty');
  assert.equal(state.meta.activityDetail, 'command approval');
});

test('stale PTY tail cannot resurrect approval after it was resolved', () => {
  const tracker = new PtyTransientTracker({ errorHoldMs: 1000 });
  tracker.feedOutput('Would you like to grant these permissions?', 1000);
  tracker.feedOutput('■ Conversation interrupted — tell the model what to do differently.', 1100);
  assert.equal(tracker.overlayState(toolState, 1100).meta.activityState, 'ERROR');
  assert.equal(tracker.snapshot(1100).approvalActive, false);

  tracker.feedOutput('unrelated repaint', 1200);
  const after = tracker.overlayState(toolState, 2201);
  assert.equal(after.meta.activityState, 'TOOL');
  assert.equal(after.meta.errorCount, 1);
  assert.equal(tracker.snapshot(2201).approvalActive, false);
});

test('generic error text does not trigger terminal ERROR state', () => {
  const tracker = new PtyTransientTracker();
  tracker.feedOutput('Write-Output "error: this is only command text"', 1000);
  assert.equal(tracker.overlayState(toolState, 1000).meta.activityState, 'TOOL');
});
