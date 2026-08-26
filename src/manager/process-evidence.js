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
  const codexPids = new Set(codex.map((process) => Number(process?.pid)).filter(Number.isFinite));
  const roots = codex.filter((process) => {
    const ppid = Number(process?.ppid);
    return !Number.isFinite(ppid) || !codexPids.has(ppid);
  });
  return { codex, roots: roots.length ? roots : codex };
}

function processStartedAtMs(process, nowMs) {
  const ageMs = Number(process?.ageMs);
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;
  return nowMs - ageMs;
}

export function buildManagerProcessEvidence(processes, {
  nowMs = Date.now(),
  startToleranceMs = 5000
} = {}) {
  if (!Array.isArray(processes)) {
    const unavailable = () => ({ processKnown: false, processMatch: false });
    unavailable.diagnostics = { processTelemetry: false, codexProcessCount: null, codexRootCount: null };
    return unavailable;
  }

  const { codex, roots } = collapseCodexRoots(processes);
  const evidence = (item) => {
    if (codex.some((process) => commandContainsThread(process, item))) {
      return { processKnown: true, processMatch: true };
    }

    const startedAtMs = Number(item?.startedAtMs);
    if (Number.isFinite(startedAtMs)) {
      const candidates = roots.filter((process) => {
        const processStart = processStartedAtMs(process, nowMs);
        return Number.isFinite(processStart) && Math.abs(processStart - startedAtMs) <= startToleranceMs;
      });
      if (candidates.length === 1) return { processKnown: true, processMatch: true };
    }

    if (codex.length === 0) return { processKnown: true, processMatch: false };

    // A successful process query is not negative evidence for a specific
    // session while some Codex process exists but cannot be mapped to it.
    return { processKnown: false, processMatch: false };
  };

  evidence.diagnostics = {
    processTelemetry: true,
    codexProcessCount: codex.length,
    codexRootCount: roots.length
  };
  return evidence;
}
