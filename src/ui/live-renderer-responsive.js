import {
  buildLiveFrame as buildLegacyFrame,
  balancedColumnCountFor,
  planGrid
} from './live-renderer-responsive-legacy.js';

export * from './live-renderer-responsive-legacy.js';

// Automatic SYSTEM telemetry is optional. It must never make the four primary
// cards unreadable just because a fifth card technically fits in the grid.
// Explicit `on` remains the forced override chosen by the user. Once SYSTEM is
// visible, both auto and forced modes use the same live legacy presentation so
// CPU/RAM history remains animated instead of being replaced by static gauges.
export const SYSTEM_CARD_MIN_OUTER_CELLS = 44;

function value(metric, fallback = null) {
  if (metric && typeof metric === 'object' && Object.prototype.hasOwnProperty.call(metric, 'value')) return metric.value ?? fallback;
  return metric ?? fallback;
}

function cloneConfig(config = {}) {
  return {
    ...config,
    sections: { ...(config.sections ?? {}) },
    metrics: { ...(config.metrics ?? {}) },
    fields: {
      ...(config.fields ?? {}),
      system: { ...(config.fields?.system ?? {}) }
    }
  };
}

function coreCards(config, state) {
  const auth = String(value(state?.auth?.mode, 'unknown'));
  const cards = [];
  if (config?.sections?.context === true && config?.metrics?.context !== false) cards.push({ id: 'context', title: 'CONTEXT', token: 'info', weight: 0.85 });
  if (config?.sections?.usage === true && config?.metrics?.usage !== false) cards.push({ id: 'usage', title: `USAGE${auth === 'login' ? ' · LOGIN' : auth === 'api' ? ' · API' : ''}`, token: 'reasoning', weight: auth === 'login' ? 1.25 : 1.15 });
  if (config?.sections?.session === true && config?.metrics?.session !== false) cards.push({ id: 'session', title: 'SESSION', token: 'healthy', weight: 1.0 });
  if (config?.sections?.activity === true && config?.metrics?.activity !== false) cards.push({ id: 'activity', title: 'CURRENT ACTIVITY', token: 'thinking', weight: 1.05 });
  return cards;
}

function cardsWithRequestedSystem(config, state) {
  const cards = coreCards(config, state);
  const systemMode = String(config?.systemMode ?? (config?.sections?.system === true ? 'on' : 'off'));
  if (systemMode !== 'off' && config?.metrics?.system !== false) {
    cards.push({ id: 'system', title: 'SYSTEM', token: 'info', weight: 0.95 });
  }
  const beastMode = String(config?.beastMode ?? 'off');
  if (beastMode === 'on') cards.push({ id: 'beast', title: 'BEAST MODE', token: 'tool', weight: 1.0 });
  return cards;
}

function systemLayoutDecision(config, state, width, height) {
  const mode = String(config?.systemMode ?? (config?.sections?.system === true ? 'on' : 'off'));
  if (mode === 'off' || config?.metrics?.system === false) return { visible: false, mode, reason: 'disabled' };

  const cards = cardsWithRequestedSystem(config, state);
  const systemIndex = cards.findIndex((card) => card.id === 'system');
  if (systemIndex < 0) return { visible: false, mode, reason: 'disabled' };

  // Explicit On is the user's forced override. Keep the responsive behavior,
  // including a second row or compact representation if necessary.
  if (mode === 'on') return { visible: true, mode, reason: 'forced-on' };

  // Use a generous height here: auto visibility is a horizontal-layout
  // decision. Actual height degradation still belongs to the base renderer.
  const widthPlan = planGrid(cards, width, Math.max(50, Number(height) || 24));
  let systemItem = null;
  for (const row of widthPlan.rows) {
    const found = row.items.find((item) => item.card.id === 'system');
    if (found) {
      systemItem = found;
      break;
    }
  }

  if (!systemItem || systemItem.outerWidth < SYSTEM_CARD_MIN_OUTER_CELLS) {
    return { visible: false, mode, reason: 'below-min-width', outerWidth: systemItem?.outerWidth ?? 0 };
  }

  const columns = balancedColumnCountFor(width, cards.length);
  if (columns !== cards.length || widthPlan.rows.length !== 1) {
    return { visible: false, mode, reason: 'auto-needs-one-row', outerWidth: systemItem.outerWidth };
  }

  return { visible: true, mode, reason: 'fits', outerWidth: systemItem.outerWidth };
}

function effectiveConfigForWidth(config, state, width, height) {
  const decision = systemLayoutDecision(config, state, width, height);
  if (decision.visible) return { config, decision };

  const next = cloneConfig(config);
  next.systemMode = 'off';
  next.sections.system = false;
  return { config: next, decision };
}

export function buildLiveFrame(options = {}) {
  const width = Math.max(20, Number(options.width) || 80);
  const height = Math.max(8, Number(options.height) || 24);
  const requestedConfig = options.config ?? {};
  const { config, decision } = effectiveConfigForWidth(requestedConfig, options.state, width, height);
  const frame = buildLegacyFrame({ ...options, config, width, height });

  return {
    ...frame,
    semantic: {
      ...frame.semantic,
      systemMode: String(requestedConfig?.systemMode ?? 'off'),
      systemMinOuterCells: SYSTEM_CARD_MIN_OUTER_CELLS,
      systemWidthDecision: decision.reason,
      systemRequested: String(requestedConfig?.systemMode ?? 'off') !== 'off'
    }
  };
}
