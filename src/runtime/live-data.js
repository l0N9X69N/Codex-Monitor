import { buildDemandGraph } from '../core/demand-graph.js';
import { CollectorManager } from '../collectors/manager.js';
import { CentralScheduler } from '../core/scheduler.js';
import { CurrentSessionTailer } from '../collectors/current-session.js';
import { createLiveCollectorRegistry } from '../collectors/live.js';

export class LiveDataRuntime {
  constructor({ state, config, adapter, cwd = process.cwd(), now = () => Date.now(), processRef = process, onUpdate = null } = {}) {
    if (!state || !config || !adapter) throw new Error('LiveDataRuntime requires state, config and adapter');
    this.state = state;
    this.config = config;
    this.adapter = adapter;
    this.cwd = cwd;
    this.activeTab = config.tabs?.[0] ?? 'overview';
    this.onUpdate = onUpdate;
    const sessionsPath = adapter.paths()?.sessions ?? null;
    this.sessionTailer = new CurrentSessionTailer({ state, sessionsPath, cwd, now });
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
      enabledTabs: this.config.tabs,
      activeTab: this.activeTab,
      sections: this.config.sections,
      enabledMetrics: this.config.metrics,
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

  setActiveTab(tab) {
    if (!this.config.tabs?.includes(tab)) return false;
    if (this.activeTab === tab) return false;
    this.activeTab = tab;
    this.sync();
    return true;
  }

  stop() { return this.scheduler.stop(); }
}
