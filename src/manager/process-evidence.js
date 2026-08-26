function text(value) {
  return String(value ?? '').toLowerCase();
}

export function isCodexProcess(process) {
  const name = text(process?.name);
  const command = text(process?.command);
  if (/^codex(?:\.exe|-[a-z0-9_]+-pc-[a-z0-9_.-]+\.exe)?$/.test(name)) return true;
  if (command.includes('@openai\\codex\\') || command.includes('@openai/codex/')) return true;
  return /(^|[\s"'\\/])codex(?=$|[\s"'\\/]|\.js\b|\.cmd\b|\.exe\b|-x86_64-pc-|-aarch64-pc-)/.test(command);
}

function commandContainsThread(process, item) {
  const threadId = text(item?.threadId).trim();
  return Boolean(threadId && text(process?.command).includes(threadId));
}

function collapseCodexRoots(processes) {
  const codex = processes.filter(isCodexProcess);
  const byPid = new Map(codex.map((process) => [Number(process?.pid), process]).filter(([pid]) => Number.isFinite(pid)));
  const codexPids = new Set(byPid.keys());
  const roots = codex.filter((process) => {
    const ppid = Number(process?.ppid);
    return !Number.isFinite(ppid) || !codexPids.has(ppid);
  });
  return { codex, roots: roots.length ? roots : codex, byPid, codexPids };
}

function rootForProcess(process, byPid) {
  let current = process;
  const seen = new Set();
  while (current) {
    const pid = Number(current?.pid);
    if (Number.isFinite(pid)) {
      if (seen.has(pid)) break;
      seen.add(pid);
    }
    const parent = byPid.get(Number(current?.ppid));
    if (!parent) return current;
    current = parent;
  }
  return process;
}

function processStartedAtMs(process, nowMs) {
  const ageMs = Number(process?.ageMs);
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;
  return nowMs - ageMs;
}

function normalizePreviousAssociations(value) {
  if (!(value instanceof Map)) return new Map();
  const out = new Map();
  for (const [sessionId, association] of value) {
    if (!sessionId) continue;
    if (Number.isFinite(Number(association))) {
      out.set(sessionId, { rootPid: Number(association), matchedBy: 'previous', missing: false });
      continue;
    }
    const rootPid = Number(association?.rootPid);
    if (!Number.isFinite(rootPid)) continue;
    out.set(sessionId, {
      rootPid,
      matchedBy: association?.matchedBy ?? 'previous',
      missing: association?.missing === true
    });
  }
  return out;
}

function assignNearestStarts(sessions, roots, usedRootPids, activeAssociations, nowMs, toleranceMs) {
  const pairs = [];
  for (const root of roots) {
    const rootPid = Number(root?.pid);
    if (Number.isFinite(rootPid) && usedRootPids.has(rootPid)) continue;
    const rootStart = processStartedAtMs(root, nowMs);
    if (!Number.isFinite(rootStart)) continue;
    for (const session of sessions) {
      if (!session?.id || activeAssociations.has(session.id)) continue;
      const sessionStart = Number(session?.startedAtMs);
      if (!Number.isFinite(sessionStart)) continue;
      const deltaMs = Math.abs(rootStart - sessionStart);
      if (deltaMs <= toleranceMs) pairs.push({ root, session, deltaMs });
    }
  }

  pairs.sort((a, b) => a.deltaMs - b.deltaMs);
  const matched = [];
  for (const pair of pairs) {
    const rootPid = Number(pair.root?.pid);
    if (Number.isFinite(rootPid) && usedRootPids.has(rootPid)) continue;
    if (activeAssociations.has(pair.session.id)) continue;
    if (Number.isFinite(rootPid)) usedRootPids.add(rootPid);
    activeAssociations.set(pair.session.id, {
      rootPid,
      matchedBy: 'start',
      missing: false,
      deltaMs: pair.deltaMs
    });
    matched.push(pair);
  }
  return matched;
}

export function buildManagerProcessEvidence(processes, {
  nowMs = Date.now(),
  sessions = [],
  previousAssociations = null,
  startToleranceMs = 120_000
} = {}) {
  if (!Array.isArray(processes)) {
    const unavailable = () => ({ processKnown: false, processMatch: false });
    unavailable.associations = normalizePreviousAssociations(previousAssociations);
    unavailable.diagnostics = {
      processTelemetry: false,
      codexProcessCount: null,
      codexRootCount: null,
      mappedSessionCount: null,
      exactMatchCount: null,
      stickyMatchCount: null,
      startMatchCount: null,
      missingAssociationCount: null
    };
    return unavailable;
  }

  const { codex, roots, byPid, codexPids } = collapseCodexRoots(processes);
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const sessionIds = new Set(sessionList.map((session) => session?.id).filter(Boolean));
  const previous = normalizePreviousAssociations(previousAssociations);
  const activeAssociations = new Map();
  const usedRootPids = new Set();
  let exactMatchCount = 0;
  let stickyMatchCount = 0;

  // Exact thread identity always wins over historical/heuristic association.
  for (const session of sessionList) {
    if (!session?.id || activeAssociations.has(session.id)) continue;
    const matchingProcess = codex.find((process) => commandContainsThread(process, session));
    if (!matchingProcess) continue;
    const root = rootForProcess(matchingProcess, byPid);
    const rootPid = Number(root?.pid);
    if (Number.isFinite(rootPid) && usedRootPids.has(rootPid)) continue;
    if (Number.isFinite(rootPid)) usedRootPids.add(rootPid);
    activeAssociations.set(session.id, { rootPid, matchedBy: 'exact', missing: false });
    exactMatchCount += 1;
  }

  // Preserve a prior one-to-one association while its Codex root still exists.
  // This prevents nearest-start heuristics from reshuffling sessions each poll.
  for (const [sessionId, association] of previous) {
    if (!sessionIds.has(sessionId) || activeAssociations.has(sessionId) || association.missing) continue;
    const rootPid = Number(association.rootPid);
    if (!codexPids.has(rootPid) || usedRootPids.has(rootPid)) continue;
    usedRootPids.add(rootPid);
    activeAssociations.set(sessionId, { rootPid, matchedBy: 'sticky', missing: false });
    stickyMatchCount += 1;
  }

  const startMatches = assignNearestStarts(
    sessionList,
    roots,
    usedRootPids,
    activeAssociations,
    nowMs,
    startToleranceMs
  );

  // A previously associated Codex root disappearing is specific negative
  // process evidence for that session. Keep a tombstone across later polls so
  // the resolver can reach ENDED after its stale/grace window even while other
  // Codex sessions remain alive.
  const missingSessionIds = new Set();
  const associations = new Map(activeAssociations);
  for (const [sessionId, association] of previous) {
    if (!sessionIds.has(sessionId) || activeAssociations.has(sessionId)) continue;
    const rootPid = Number(association.rootPid);
    if (codexPids.has(rootPid)) continue;
    missingSessionIds.add(sessionId);
    associations.set(sessionId, {
      rootPid,
      matchedBy: association.matchedBy ?? 'previous',
      missing: true
    });
  }

  const evidence = (item) => {
    // Exact thread evidence must remain usable even when the caller did not
    // provide the optional sessions list used by nearest-start precomputation.
    if (codex.some((process) => commandContainsThread(process, item))) {
      return { processKnown: true, processMatch: true };
    }
    if (item?.id && activeAssociations.has(item.id)) {
      return { processKnown: true, processMatch: true };
    }
    if (item?.id && missingSessionIds.has(item.id)) {
      return { processKnown: true, processMatch: false };
    }
    if (codex.length === 0) return { processKnown: true, processMatch: false };

    // A successful process query is not negative evidence for an unrelated
    // session while some Codex process exists but has never been mapped to it.
    return { processKnown: false, processMatch: false };
  };

  evidence.associations = associations;
  evidence.diagnostics = {
    processTelemetry: true,
    codexProcessCount: codex.length,
    codexRootCount: roots.length,
    mappedSessionCount: activeAssociations.size,
    exactMatchCount,
    stickyMatchCount,
    startMatchCount: startMatches.length,
    missingAssociationCount: missingSessionIds.size,
    startMatchMaxDeltaMs: startMatches.length
      ? Math.max(...startMatches.map((pair) => pair.deltaMs))
      : null
  };
  return evidence;
}
