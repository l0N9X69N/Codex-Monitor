import { parseRolloutLine } from './rollout-event.js';

export class IncrementalJsonlParser {
  constructor() {
    this.buffer = '';
    this.lineNumber = 0;
  }

  push(chunk) {
    const text = this.buffer + String(chunk ?? '');
    const lines = text.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    const results = [];
    for (const line of lines) {
      this.lineNumber += 1;
      const parsed = parseRolloutLine(line);
      results.push({ lineNumber: this.lineNumber, ...parsed });
    }
    return results;
  }

  flushPartial() {
    if (!this.buffer) return null;
    const partial = this.buffer;
    this.buffer = '';
    this.lineNumber += 1;
    return { lineNumber: this.lineNumber, ...parseRolloutLine(partial) };
  }
}
