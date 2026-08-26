import { dashboardLayoutMode, resolveManagerViewMode } from './dashboard-render.js';

function safeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fullPreviewPanelHeight({ safeHeight, resolvedView, telemetry }) {
  const bodyHeight = safeHeight - 3;
  if (resolvedView === 'table') {
    const summaryHeight = 4;
    return bodyHeight - summaryHeight;
  }
  if (resolvedView === 'operations') {
    return Math.max(5, bodyHeight - 7 - 11);
  }
  if (resolvedView === 'charts') {
    const aggregateHeight = 11;
    const liveCount = Array.isArray(telemetry?.sessions) ? telemetry.sessions.length : 0;
    const maxLiveRows = Math.max(
      1,
      Math.min(liveCount || 1, Math.max(1, Math.floor(bodyHeight * 0.28) - 3))
    );
    const liveHeight = Math.max(4, maxLiveRows + 3);
    const rankingHeight = 7;
    return Math.max(5, bodyHeight - aggregateHeight - liveHeight - rankingHeight);
  }
  return 0;
}

export function activityPreviewPanelHeight({
  width = 120,
  height = 36,
  viewMode = 'operations',
  telemetry = null
} = {}) {
  const safeWidth = Math.max(44, safeNumber(width, 120));
  const safeHeight = Math.max(16, safeNumber(height, 36));
  const layout = dashboardLayoutMode(safeWidth);
  if (safeWidth < 220 || layout !== 'ultrawide') return 0;

  const resolvedView = resolveManagerViewMode(viewMode, layout);
  const panelHeight = fullPreviewPanelHeight({ safeHeight, resolvedView, telemetry });
  if (panelHeight < 6) return 0;

  // On shorter terminals the session table is the primary control surface.
  // Keep its full lower-pane height while making activity a compact sidecar.
  // Tall terminals can afford a full-height activity pane.
  if (safeHeight >= 44) return panelHeight;
  return Math.min(panelHeight, Math.max(6, Math.floor(panelHeight * 0.55)));
}

export function activityPreviewCapacity(options = {}) {
  const panelHeight = activityPreviewPanelHeight(options);
  if (panelHeight < 6) return 0;
  return Math.max(1, panelHeight - 2);
}
