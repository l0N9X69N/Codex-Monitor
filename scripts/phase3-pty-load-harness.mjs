import process from 'node:process';
import { detectAuth } from '../src/core/auth.js';
import { buildDemandGraph } from '../src/core/demand-graph.js';
import { createTestInstrumentation } from '../src/core/instrumentation.js';
import { RingBuffer } from '../src/core/ring-buffer.js';
import { CentralScheduler } from '../src/core/scheduler.js';
import { CollectorRegistry } from '../src/collectors/registry.js';
import { CollectorManager } from '../src/collectors/manager.js';
import { completeHostExit } from '../src/platform/host-lifecycle.js';
import { resolveCodexExecutable } from '../src/platform/pty.js';
import { runCodexLive } from '../src/runtime/live-runner.js';

const codexPath = resolveCodexExecutable();
if (!codexPath) {
  process.stderr.write('Phase 03 harness: official Codex CLI not found.\n');
  process.exit(2);
}

const instrumentation = createTestInstrumentation();
const samples = new RingBuffer(120);
const registry = new CollectorRegistry();
registry.register({
  id: 'session',
  ttlMs: 250,
  priority: 100,
  run: async ({ nowMs }) => samples.push({ kind: 'session', atMs: nowMs })
});
registry.register({
  id: 'performance',
  ttlMs: 100,
  priority: 40,
  run: async ({ nowMs }) => samples.push({ kind: 'performance', atMs: nowMs })
});
registry.register({
  id: 'processes',
  ttlMs: 250,
  priority: 30,
  run: async ({ nowMs }) => samples.push({ kind: 'processes', atMs: nowMs })
});

const manager = new CollectorManager({ registry, instrumentation });
manager.syncPlan(buildDemandGraph({
  header: ['activity', 'model'],
  enabledTabs: ['overview', 'performance', 'processes'],
  activeTab: 'performance',
  sections: { activity: true, context: true, usage: true, session: true }
}));
const scheduler = new CentralScheduler({ manager, instrumentation, tickMs: 50 });
const auth = detectAuth({ codexPath });

process.stderr.write('Phase 03 PTY load harness: scheduler active. Use Codex normally, run a tool/output-heavy prompt, then /exit.\n');
scheduler.start();

let exitCode = 1;
try {
  exitCode = await runCodexLive({ codexPath, auth });
} finally {
  scheduler.stop();
  const stats = instrumentation.snapshot();
  process.stderr.write(`\nPhase 03 harness stats: polls=${stats.pollCount} collectorRuns=${stats.collectorRuns} samples=${samples.size}\n`);
}

completeHostExit(exitCode);
