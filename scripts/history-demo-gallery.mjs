import { renderHistoryFrame } from '../src/history/render.js';
import { stripAnsi } from '../src/ui/cell-width.js';

const sessions = Array.from({ length: 8 }, (_, index) => ({
  id: `session-${index + 1}`,
  name: `rollout-2026-08-${String(25 - index).padStart(2, '0')}-demo-${index + 1}`,
  sizeBytes: 12000 + index * 7300,
  modifiedAtMs: Date.parse(`2026-08-${String(25 - index).padStart(2, '0')}T0${index}:15:00Z`)
}));

const model = {
  info: { threadId: 'thread-demo-01', model: 'gpt-5.6-luna', reasoning: 'medium', cwd: 'F:/LOCAL_APP/Codex Monitor', startedAtMs: Date.parse('2026-08-25T00:00:00Z'), lastEventAtMs: Date.parse('2026-08-25T00:22:10Z') },
  tokens: { input: 28400, cached: 19100, output: 4200, reasoning: 1800, contextWindow: 200000, contextUsed: 84000 },
  turns: { count: 18, completed: 18, lastDurationMs: 8200 },
  tools: { count: 11, byName: { shell: 5, git: 3, 'mcp.read': 2, patch: 1 } },
  resources: { evidence: [{ kind: 'MCP', value: 'mcp.read' }] },
  errors: [{ atMs: Date.parse('2026-08-25T00:10:00Z'), detail: 'tool exited with status 1' }]
};

const cases = [
  ['NORMAL', 100, 30, false],
  ['ULTRAWIDE', 160, 38, false],
  ['STORAGE ENTRY', 120, 32, true]
];

for (const [name, width, height, storageMode] of cases) {
  process.stdout.write(`\n=== HISTORY ${name} · ${width}x${height} ===\n`);
  const frame = renderHistoryFrame({ sessions, selectedIndex: 0, selectedModel: model, activeDetailTab: 0, width, height, mode: 'mono', storageMode });
  process.stdout.write(`${stripAnsi(frame.lines.join('\n'))}\n`);
}

process.stdout.write('\nHistory demo gallery complete. Real TUI: codexm --history\n');
