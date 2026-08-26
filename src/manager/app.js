import { buildProcessEvidence, SessionManagerCore, SESSION_ACTIVITY } from './session-core.js';

function summaryLines(items, diagnostics = null, processError = null) {
  const counts = { live: 0, ended: 0, unknown: 0 };
  let totalBytes = 0;
  for (const item of items) {
    if (item.state === SESSION_ACTIVITY.LIVE) counts.live += 1;
    else if (item.state === SESSION_ACTIVITY.ENDED) counts.ended += 1;
    else counts.unknown += 1;
    if (Number.isFinite(item.sizeBytes)) totalBytes += item.sizeBytes;
  }
  const lines = [
    'Codex Monitor Session Manager · Phase 08 core',
    `Sessions: ${items.length} · LIVE ${counts.live} · ENDED ${counts.ended} · UNKNOWN ${counts.unknown}`,
    `Storage indexed: ${totalBytes} bytes`
  ];
  if (diagnostics?.processTelemetry) {
    lines.push(`Codex processes: ${diagnostics.codexProcessCount} · roots ${diagnostics.codexRootCount} · mapped ${diagnostics.mappedSessionCount ?? 0}`);
    lines.push(`Process correlation: exact ${diagnostics.exactMatchCount ?? 0} · start ${diagnostics.startMatchCount ?? 0}`);
  } else if (diagnostics) {
    lines.push(`Codex processes: telemetry unavailable${processError ? ` · ${processError}` : ''}`);
  }
  lines.push('Interactive dashboard rendering arrives in Phase 09.');
  return lines;
}

export async function runSessionManager({
  platformAdapter,
  stdout = process.stdout,
  fsRef,
  now = () => Date.now()
} = {}) {
  if (!platformAdapter) throw new Error('Session Manager requires platform adapter');
  const sessionsPath = platformAdapter.paths()?.sessions ?? null;
  const core = new SessionManagerCore({ sessionsPath, fsRef, now });
  core.discover();

  let processEvidence = buildProcessEvidence(null);
  let processError = null;
  try {
    const processes = await platformAdapter.getProcessTree();
    if (Array.isArray(processes)) {
      processEvidence = buildProcessEvidence(processes, { nowMs: now(), sessions: core.index });
    } else {
      processError = processes?.detail ?? 'process telemetry unavailable';
      processEvidence = buildProcessEvidence(null);
    }
  } catch (error) {
    processError = error?.message ?? 'process query failed';
  }

  const items = core.refresh({ processEvidence });
  stdout.write(`${summaryLines(items, processEvidence.diagnostics, processError).join('\n')}\n`);
  return { code: 0, core, items, processDiagnostics: processEvidence.diagnostics, processError };
}

export { summaryLines as sessionManagerSummaryLines };
