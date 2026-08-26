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
  return { codex, roots: roots.length ? roots : codex, byPid };
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

function assignNearestStarts(sessions, roots, usedRootPids, matchedSessionIds, nowMs, toleranceMs) {
  const pairs = [];
  for (const root of roots) {
    const rootPid = Number(root?.pid);
    if (Number.isFinite(rootPid) && usedRootPids.has(rootPid)) continue;
    const rootStart = processStartedAtMs(root, nowMs);
    if (!Number.isFinite(rootStart)) continue;
    for (const session of sessions) {
      if (!session?.id || matchedSessionIds.has(session.id)) continue;
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
    if (matchedSessionIds.has(pair.session.id)) continue;
    if (Number.isFinite(rootPid)) usedRootPids.add(rootPid);
    matchedSessionIds.add(pair.session.id);
    matched.push(pair);
  }
  return matched;
}

export function buildManagerProcessEvidence(processes, {
  nowMs = Date.now(),
  sessions = [],
  startToleranceMs = 120_000
} = {}) {
  if (!Array.isArray(processes)) {
    const unavailable = () => ({ processKnown: false, processMatch: false });
    unavailable.diagnostics = {
      processTelemetry: false,
      codexProcessCount: null,
      codexRootCount: null,
      mappedSessionCount: null,
      exactMatchCount: null,
      startMatchCount: null
    };
    return unavailable;
  }

  const { codex, roots, byPid } = collapseCodexRoots(processes);
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const matchedSessionIds = new Set();
  const usedRootPids = new Set();
  let exactMatchCount = 0;

  for (const session of sessionList) {
    const matchingProcess = codex.find((process) => commandContainsThread(process, session));
    if (!matchingProcess || !session?.id) continue;
    matchedSessionIds.add(session.id);
    const root = rootForProcess(matchingProcess, byPid);
    const rootPid = Number(root?.pid);
    if (Number.isFinite(rootPid)) usedRootPids.add(rootPid);
    exactMatchCount += 1;
  }

  const startMatches = assignNearestStarts(
    sessionList,
    roots,
    usedRootPids,
    matchedSessionIds,
    nowMs,
    startToleranceMs
  );

  const evidence = (item) => {
    if (item?.id && matchedSessionIds.has(item.id)) {
      return { processKnown: true, processMatch: true };
    }
    if (codex.length === 0) return { processKnown: true, processMatch: false };

    // A successful process query is not negative evidence for a specific
    // session while some Codex process exists but cannot be mapped to it.
    return { processKnown: false, processMatch: false };
  };

  evidence.diagnostics = {
    processTelemetry: true,
    codexProcessCount: codex.length,
    codexRootCount: roots.length,
    mappedSessionCount: matchedSessionIds.size,
    exactMatchCount,
    startMatchCount: startMatches.length,
    startMatchMaxDeltaMs: startMatches.length
      ? Math.max(...startMatches.map((pair) => pair.deltaMs))
      : null
  };
  return evidence;
}
