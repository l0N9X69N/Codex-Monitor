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
      const event = result.event;
      applyNormalizedEvent(this.state, event, { source: PROVENANCE.OFFICIAL_CURRENT });

      // Modern Codex stores RateLimitSnapshot inside TokenCountEvent rather than
      // requiring a separate rate_limits rollout line. Feed that embedded
      // snapshot through the existing quota reducer as a synthetic normalized
      // event so 5H/WEEK update from the same official current-session source.
      if (event?.kind === 'usage' && event.rateLimits && typeof event.rateLimits === 'object') {
        const { primary = null, secondary = null } = event.rateLimits;
        if (primary || secondary) {
          applyNormalizedEvent(this.state, {
            kind: 'quota',
            atMs: event.atMs,
            rawType: `${event.rawType ?? 'token_count'}:rate_limits`,
            primary,
            secondary
          }, { source: PROVENANCE.OFFICIAL_CURRENT });
        }
      }
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
