import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES } from '../src/profile.js';
import { renderMonitor } from '../src/render-full.js';

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const plain = (s) => String(s).replace(ANSI_RE, '');

function sampleState(activityState = 'TOOL') {
  return {
    fiveHour: { remainingPercent: 64, resetsAt: 2000000000 },
    weekly: { remainingPercent: 82, resetsAt: 2000500000 },
    usage: {
      total: { inputTokens: 567000, cachedInputTokens: 505000, outputTokens: 6400, reasoningOutputTokens: 3900 },
      last: { inputTokens: 49500, outputTokens: 5, totalTokens: 79000 },
      contextWindow: 258000
    },
    meta: {
      model: 'gpt-5.4-mini', reasoningEffort: 'medium', currentSession: true,
      activityState, activitySource: 'rollout', activityDetail: 'running shell',
      turnCount: 6, lastTurnDurationMs: 16000, lastEventAtMs: 1900000000000,
      compactCount: 2, retryCount: 0, errorCount: 0, activeToolIds: ['1'],
      anonymousToolDepth: 0, approvalPending: false, errorActive: false,
      lastToolName: 'shell', threadId: 'abcdef1234567890', cliVersion: '0.99.0'
    }
  };
}

test('full renderer builds the agreed four-column dashboard', () => {
  const cols = 180;
  const runtime = {
    startedAtMs: 1899999000000,
    project: 'demo-project', branch: 'main', dirtyCount: 2,
    profile: PROFILES['f-l']
  };
  const lines = renderMonitor(sampleState(), cols, 1900000000000, runtime);
  assert.equal(lines.length, 9);
  const joined = lines.map(plain).join('\n');
  assert.match(joined, /CONTEXT/);
  assert.match(joined, /USAGE · LOGIN/);
  assert.match(joined, /SESSION/);
  assert.match(joined, /CURRENT ACTIVITY/);
  assert.match(joined, /AUTH LOGIN/);
  for (const line of lines) assert.ok([...plain(line)].length <= cols);
});
