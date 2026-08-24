import { PROVENANCE } from './provenance.js';
import { applyNormalizedEvent } from './reducer.js';
import { IncrementalJsonlParser } from '../parsers/jsonl-incremental.js';
import { parsePtyTransient } from '../parsers/pty-transient.js';

export class MonitorIngestPipeline {
  constructor(state) {
    this.state = state;
    this.rollout = new IncrementalJsonlParser();
    this.stats = {
      rolloutLines: 0,
      rolloutAccepted: 0,
      rolloutRejected: 0,
      ptyEvents: 0
    };
  }

  pushRolloutChunk(chunk) {
    const results = this.rollout.push(chunk);
    for (const result of results) {
      this.stats.rolloutLines += 1;
      if (!result.ok) {
        this.stats.rolloutRejected += 1;
        continue;
      }
      this.stats.rolloutAccepted += 1;
      applyNormalizedEvent(this.state, result.event, { source: PROVENANCE.OFFICIAL_CURRENT });
    }
    return results;
  }

  pushPtyText(text, atMs = Date.now()) {
    const events = parsePtyTransient(text, atMs);
    for (const event of events) {
      this.stats.ptyEvents += 1;
      applyNormalizedEvent(this.state, event, { source: PROVENANCE.OFFICIAL_CURRENT });
      if (event.source) {
        this.state.activity.source.value = event.source;
      }
    }
    return events;
  }
}
