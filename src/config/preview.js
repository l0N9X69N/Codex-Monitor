import { hpaint } from '../history/theme.js';
import { renderSessionDashboard } from '../manager/dashboard-render.js';
import { padCells, truncateCells } from '../ui/cell-width.js';
import { renderDemo } from '../ui/demo.js';
import { normalizeConfig } from './schema.js';

function previewRows(nowMs) {
  return [
    {
      id: 'preview-live-1',
      threadId: '019c-preview-live-0001',
      name: 'preview-live-0001',
      project: 'Codex-Monitor',
      cwd: 'D:/App/Codex-Monitor',
      state: 'LIVE',
      model: 'gpt-5.6-sol',
      reasoning: 'high',
      lastActivityAtMs: nowMs - 2_000,
      modifiedAtMs: nowMs - 2_000,
      elapsedMs: 184_000,
      lastTurnDurationMs: 16_300,
      turnCount: 7,
      toolCount: 4,
      agentSpawnCount: 1,
      fileSizeBytes: 3_450_000,
      tokens: {
        input: 843_000,
        cached: 749_000,
        output: 9_500,
        reasoning: 4_900,
        contextUsed: 95_600,
        contextWindow: 258_000
      },
      recentErrors: [],
      recentRetries: [],
      recentCompactions: []
    },
    {
      id: 'preview-ended-2',
      threadId: '019c-preview-ended-0002',
      name: 'preview-ended-0002',
      project: 'API-Gateway',
      cwd: 'D:/Work/API-Gateway',
      state: 'ENDED',
      model: 'gpt-5.6-sol',
      reasoning: 'medium',
      lastActivityAtMs: nowMs - 95_000,
      modifiedAtMs: nowMs - 95_000,
      elapsedMs: 742_000,
      lastTurnDurationMs: 8_400,
      turnCount: 15,
      toolCount: 11,
      agentSpawnCount: 0,
      fileSizeBytes: 8_250_000,
      tokens: {
        input: 1_240_000,
        cached: 1_060_000,
        output: 18_900,
        reasoning: 7_200,
        contextUsed: 166_000,
        contextWindow: 258_000
      },
      recentErrors: [],
      recentRetries: [{}],
      recentCompactions: [{}]
    },
    {
      id: 'preview-ended-3',
      threadId: '019c-preview-ended-0003',
      name: 'preview-ended-0003',
      project: 'CLI-Tools',
      cwd: 'D:/Work/CLI-Tools',
      state: 'ENDED',
      model: 'gpt-5.6-sol',
      reasoning: 'low',
      lastActivityAtMs: nowMs - 640_000,
      modifiedAtMs: nowMs - 640_000,
      elapsedMs: 308_000,
      lastTurnDurationMs: 3_100,
      turnCount: 6,
      toolCount: 3,
      agentSpawnCount: 0,
      fileSizeBytes: 1_820_000,
      tokens: {
        input: 412_000,
        cached: 325_000,
        output: 6_100,
        reasoning: 1_900,
        contextUsed: 52_000,
        contextWindow: 258_000
      },
      recentErrors: [],
      recentRetries: [],
      recentCompactions: []
    }
  ];
}

function footer(width, mode, text) {
  return truncateCells(hpaint(text, 'dim', mode), width, '');
}

function fitFrame(lines, width, height, mode, footerText) {
  const safeWidth = Math.max(44, Number(width) || 120);
  const safeHeight = Math.max(16, Number(height) || 36);
  const output = (Array.isArray(lines) ? lines : []).slice(0, Math.max(0, safeHeight - 1));
  while (output.length < safeHeight - 1) output.push('');
  output.push(footer(safeWidth, mode, footerText));
  return output.slice(0, safeHeight).map((line) => truncateCells(line, safeWidth, ''));
}

export function renderConfigPreview({
  kind = 'live',
  config,
  width = 120,
  height = 36,
  mode = 'mono',
  nowMs = Date.now()
} = {}) {
  const normalized = normalizeConfig(config);
  const safeWidth = Math.max(44, Number(width) || 120);
  const safeHeight = Math.max(16, Number(height) || 36);

  if (kind === 'manager') {
    const frame = renderSessionDashboard({
      rows: previewRows(nowMs),
      width: safeWidth,
      height: safeHeight,
      mode,
      selectedIndex: 0,
      viewMode: normalized.manager?.view ?? 'operations',
      telemetry: null
    });
    const lines = [...frame.lines];
    if (lines.length) {
      lines[0] = truncateCells(`${lines[0]}  ${hpaint('CONFIG PREVIEW', 'nav', mode)}`, safeWidth, '');
    }
    return {
      kind: 'manager',
      source: 'renderSessionDashboard',
      lines: fitFrame(lines, safeWidth, safeHeight, mode, 'Preview only · Esc/Q back · P Live preview · no session store was read')
    };
  }

  const live = renderDemo({
    state: 'tool',
    config: normalized,
    width: safeWidth,
    height: Math.max(16, safeHeight - 3),
    authMode: 'login',
    cwd: 'D:/App/Codex-Monitor',
    nowMs
  });
  const title = hpaint('CODEX MONITOR · LIVE CONFIG PREVIEW', 'heading', mode);
  const lines = [
    truncateCells(title, safeWidth, ''),
    hpaint('Production Live renderer · normalized demo state · no Codex process is spawned', 'dim', mode),
    '',
    ...live.lines
  ];
  return {
    kind: 'live',
    source: 'renderDemo',
    lines: fitFrame(lines, safeWidth, safeHeight, mode, 'Preview only · Esc/Q back · M Manager preview · no preference is saved')
  };
}

export function configPreviewSampleRows(nowMs = Date.now()) {
  return previewRows(nowMs).map((row) => ({ ...row, tokens: { ...row.tokens } }));
}
