import { dashboardLayoutMode, resolveManagerViewMode } from './dashboard-render.js';

function safeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function activityPreviewCapacity({
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
  const bodyHeight = safeHeight - 3;
  let panelHeight = 0;

  if (resolvedView === 'table') {
    const summaryHeight = 4;
    panelHeight = bodyHeight - summaryHeight;
  } else if (resolvedView === 'operations') {
    panelHeight = Math.max(5, bodyHeight - 7 - 11);
  } else if (resolvedView === 'charts') {
    const aggregateHeight = 11;
    const liveCount = Array.isArray(telemetry?.sessions) ? telemetry.sessions.length : 0;
    const maxLiveRows = Math.max(
      1,
      Math.min(liveCount || 1, Math.max(1, Math.floor(bodyHeight * 0.28) - 3))
    );
    const liveHeight = Math.max(4, maxLiveRows + 3);
    const rankingHeight = 7;
    panelHeight = Math.max(5, bodyHeight - aggregateHeight - liveHeight - rankingHeight);
  }

  if (panelHeight < 6) return 0;
  return Math.max(1, panelHeight - 2);
}
