import { buildDemandGraph } from '../core/demand-graph.js';
import { CollectorManager } from '../collectors/manager.js';
import { CentralScheduler } from '../core/scheduler.js';
import { CurrentSessionTailer, bootstrapLatestAccountQuota } from '../collectors/current-session.js';
import { createLiveCollectorRegistry } from '../collectors/live.js';

const PASSIVE_LIVE_METRICS = Object.freeze({
  overview: ['activity', 'model', 'reasoning', 'context', 'usage', 'quota', 'session']
});

function isResumeIntent(codexArgs = []) {
  return Array.isArray(codexArgs) && codexArgs.some((arg) => String(arg).toLowerCase() === 'resume');
}

export class LiveDataRuntime {
  constructor({ state, config, adapter, cwd = process.cwd(), codexArgs = [], now = () => Date.now(), processRef = process, onUpdate = null } = {}) {
    if (!state || !config || !adapter) throw new Error('LiveDataRuntime requires state, config and adapter');
    this.state = state;
    this.config = config;
    this.adapter = adapter;
    this.cwd = cwd;
    this.onUpdate = onUpdate;
    const sessionsPath = adapter.paths()?.sessions ?? null;
    this.resumeMode = isResumeIntent(codexArgs);

    // Account quota is account-scoped, not session-scoped. Bootstrap once from
    // the newest local Codex evidence so Login users do not start from a blank
    // quota panel. A new current-session snapshot will supersede it naturally.
    this.quotaBootstrap = bootstrapLatestAccountQuota(state, sessionsPath);

    this.sessionTailer = new CurrentSessionTailer({
      state,
      sessionsPath,
      cwd,
      now,
      resumeMode: this.resumeMode
    });
    this.registry = createLiveCollectorRegistry({ state, adapter, cwd, sessionTailer: this.sessionTailer, now, processRef });
    for (const entry of this.registry.list()) {
      const run = entry.run;
      entry.run = async (context) => {
        const result = await run(context);
        this.onUpdate?.(entry.id, result);
        return result;
      };
    }
    this.manager = new CollectorManager({ registry: this.registry, now });
    this.scheduler = new CentralScheduler({ manager: this.manager, now });
  }

  graph() {
    return buildDemandGraph({
      header: this.config.header,
      enabledTabs: ['overview'],
      activeTab: 'overview',
      sections: this.config.sections,
      enabledMetrics: this.config.metrics,
      viewMetrics: PASSIVE_LIVE_METRICS,
      git: {
        diffStats: this.config.metrics?.gitDiff === true,
        aheadBehind: this.config.metrics?.gitAheadBehind === true
      }
    });
  }

  sync() {
    const graph = this.graph();
    this.manager.syncPlan(graph);
    return graph;
  }

  start() { this.sync(); return this.scheduler.start(); }
  stop() { return this.scheduler.stop(); }
}

export { isResumeIntent };
