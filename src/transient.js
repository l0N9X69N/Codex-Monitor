const CSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const OSC_RE = /\x1b\][^\x07]*(?:\x07|\x1b\\)/g;
const DCS_RE = /\x1b(?:P|X|\^|_)[\s\S]*?\x1b\\/g;
const SINGLE_ESC_RE = /\x1b[@-_]/g;

const APPROVAL_PATTERNS = [
  /Would you like to run the following command\?/i,
  /Would you like to grant these permissions\?/i,
  /Would you like to make the following edits\?/i,
  /Do you want to approve network access to/i,
  /\bneeds your approval\./i,
  /Press enter to confirm or esc to cancel/i
];

const APPROVAL_RESOLVED_PATTERNS = [
  /You cancel(?:ed|led) the request/i,
  /request (?:was )?(?:cancelled|canceled|declined|denied)/i,
  /Conversation interrupted\b/i
];

const EXECUTION_PATTERNS = [
  /(?:^|\s)[•●]\s+Running\b/i,
  /(?:^|\s)Running\s+\$/i,
  /(?:^|\s)Ran\s+\$/i
];

// Codex TUI renders terminal errors as a red "■ <message>" history cell.
// We intentionally do not match generic words like "error" because command
// output and user content can contain them legitimately.
const ERROR_PATTERNS = [
  /■\s+[^\n\r]+/,
  /\bCodex is currently experiencing high load\./i,
  /\bUsage limit reached\./i,
  /\bYou've reached your usage limit\b/i
];

function stripTerminalControls(value) {
  return String(value)
    .replace(OSC_RE, ' ')
    .replace(DCS_RE, ' ')
    .replace(CSI_RE, ' ')
    .replace(SINGLE_ESC_RE, ' ');
}

function normalizeForScan(value) {
  return stripTerminalControls(value)
    .replace(/\r/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n+/g, ' \n ');
}

// Find only matches that touch the newly received PTY chunk.
// `newChunkStartsAt` is the length of the retained old tail. A match wholly
// inside that old tail is stale and must never fire again.
function lastFreshPatternMatch(text, patterns, newChunkStartsAt) {
  let best = null;

  for (const pattern of patterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    let match;

    while ((match = re.exec(text)) !== null) {
      const end = match.index + match[0].length;

      // `>` deliberately allows a phrase to start in the old tail and finish
      // in the new chunk, which is why the tail exists in the first place.
      if (end > newChunkStartsAt && (!best || match.index >= best.index)) {
        best = { index: match.index, end, text: match[0] };
      }

      if (match[0].length === 0) re.lastIndex += 1;
    }
  }

  return best;
}

function approvalDetail(text) {
  const value = String(text || '');
  if (/run the following command/i.test(value)) return 'command approval';
  if (/grant these permissions/i.test(value)) return 'permission approval';
  if (/make the following edits/i.test(value)) return 'file edit approval';
  if (/network access/i.test(value)) return 'network approval';
  if (/needs your approval/i.test(value)) return 'tool approval';
  return 'approval prompt';
}

function errorDetail(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (/conversation interrupted/i.test(clean)) return 'conversation interrupted';
  if (/usage limit reached/i.test(clean)) return 'usage limit reached';
  if (/high load/i.test(clean)) return 'service high load';
  return 'terminal error';
}

function isArrowOrNavigationSequence(text) {
  return /^\x1b\[[0-9;]*[ABCDHF~]$/.test(text)
    || /^\x1bO[ABCDHF]$/.test(text);
}

function isApprovalDecisionInput(data) {
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
  if (!text) return false;
  if (isArrowOrNavigationSequence(text)) return false;

  // Enter, Esc, direct shortcut letters and numbered choices are all used by
  // Codex approval views. Mouse/arrow navigation alone must not clear APPR.
  if (text === '\x1b') return true;
  if (/[\r\n]/.test(text)) return true;

  const cleaned = text
    .replace(/\x1b\[[0-9;]*[A-Za-z~]/g, '')
    .replace(/\x1bO[A-Za-z]/g, '')
    .trim();

  return /^(?:[123]|y|n|p)$/i.test(cleaned);
}

function isFreshUserPromptInput(data) {
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
  if (!text || isArrowOrNavigationSequence(text)) return false;
  if (text === '\x1b') return false;

  const cleaned = text
    .replace(/\x1b\[[0-9;]*[A-Za-z~]/g, '')
    .replace(/\x1bO[A-Za-z]/g, '')
    .replace(/[\r\n]/g, '')
    .trim();

  return cleaned.length > 0;
}

export class PtyTransientTracker {
  constructor({ errorHoldMs = 8000, tailChars = 2048 } = {}) {
    this.errorHoldMs = errorHoldMs;
    this.tailChars = tailChars;
    this.tail = '';
    this.approvalActive = false;
    this.approvalAtMs = null;
    this.approvalDetail = null;
    this.errorUntilMs = 0;
    this.errorAtMs = null;
    this.errorDetail = null;
    this.transientErrorCount = 0;
  }

  feedOutput(data, nowMs = Date.now()) {
    const clean = normalizeForScan(data);
    if (!clean) return false;

    const oldTail = this.tail;
    const boundary = oldTail.length;
    const scan = `${oldTail}${clean}`;

    const approval = lastFreshPatternMatch(scan, APPROVAL_PATTERNS, boundary);
    const resolved = lastFreshPatternMatch(scan, APPROVAL_RESOLVED_PATTERNS, boundary);
    const execution = lastFreshPatternMatch(scan, EXECUTION_PATTERNS, boundary);
    const error = lastFreshPatternMatch(scan, ERROR_PATTERNS, boundary);

    let changed = false;

    // Process only fresh signals, in their visual order inside this PTY write.
    const signals = [
      approval ? { type: 'approval', index: approval.index, text: approval.text } : null,
      resolved ? { type: 'resolved', index: resolved.index, text: resolved.text } : null,
      execution ? { type: 'execution', index: execution.index, text: execution.text } : null,
      error ? { type: 'error', index: error.index, text: error.text } : null
    ].filter(Boolean).sort((a, b) => a.index - b.index);

    for (const signal of signals) {
      if (signal.type === 'approval') {
        // A genuinely newer approval replaces any older transient error.
        if (this.errorUntilMs > nowMs) changed = true;
        this.errorUntilMs = 0;

        if (!this.approvalActive) changed = true;
        this.approvalActive = true;
        this.approvalAtMs = nowMs;
        this.approvalDetail = approvalDetail(signal.text);
      } else if (signal.type === 'resolved') {
        if (this.approvalActive) changed = true;
        this.approvalActive = false;
        this.approvalDetail = null;
      } else if (signal.type === 'execution') {
        // Execution means any approval prompt has been resolved.
        if (this.approvalActive) changed = true;
        if (this.errorUntilMs > nowMs) changed = true;
        this.approvalActive = false;
        this.approvalDetail = null;
        this.errorUntilMs = 0;
        this.errorDetail = null;
      } else if (signal.type === 'error') {
        // A terminal error ends the approval overlay. This is the key fix for
        // APPROVAL -> ERROR -> stale APPROVAL resurrection.
        if (this.approvalActive) changed = true;
        this.approvalActive = false;
        this.approvalDetail = null;

        const wasActive = this.errorUntilMs > nowMs;
        this.errorUntilMs = Math.max(this.errorUntilMs, nowMs + this.errorHoldMs);
        this.errorAtMs = nowMs;
        this.errorDetail = errorDetail(signal.text);
        if (!wasActive) {
          this.transientErrorCount += 1;
          changed = true;
        }
      }
    }

    this.tail = scan.slice(-this.tailChars);
    return changed;
  }

  feedInput(data, nowMs = Date.now()) {
    let changed = false;

    if (this.approvalActive && isApprovalDecisionInput(data)) {
      this.approvalActive = false;
      this.approvalDetail = null;
      changed = true;
    }

    // A fresh user action after a terminal error starts a new interaction and
    // should release the temporary red state immediately.
    if (this.errorUntilMs > nowMs && isFreshUserPromptInput(data)) {
      this.errorUntilMs = 0;
      this.errorDetail = null;
      changed = true;
    }

    return changed;
  }

  clearApproval() {
    const changed = this.approvalActive;
    this.approvalActive = false;
    this.approvalDetail = null;
    return changed;
  }

  overlayState(baseState, nowMs = Date.now()) {
    const base = baseState ?? { meta: {} };
    const meta = { ...(base.meta ?? {}) };

    // If the durable rollout has already reached a newer IDLE event, a
    // transient approval latch cannot still be valid.
    const baseActivity = String(meta.activityState ?? 'IDLE').toUpperCase();
    const baseEventAtMs = Number(meta.lastEventAtMs);
    if (
      this.approvalActive
      && baseActivity === 'IDLE'
      && Number.isFinite(baseEventAtMs)
      && Number.isFinite(this.approvalAtMs)
      && baseEventAtMs > this.approvalAtMs
    ) {
      this.approvalActive = false;
      this.approvalDetail = null;
    }

    const errorActive = this.errorUntilMs > nowMs;
    meta.errorCount = (base?.meta?.errorCount ?? 0) + this.transientErrorCount;

    // Priority:
    // ERROR > APPROVAL > TOOL > THINKING > IDLE.
    if (errorActive) {
      meta.activityState = 'ERROR';
      meta.activityAtMs = this.errorAtMs ?? nowMs;
      meta.activitySource = 'pty';
      meta.activityDetail = this.errorDetail || 'terminal error';
      meta.errorActive = true;
      meta.approvalPending = false;
    } else if (this.approvalActive) {
      meta.activityState = 'APPROVAL';
      meta.activityAtMs = this.approvalAtMs ?? nowMs;
      meta.activitySource = 'pty';
      meta.activityDetail = this.approvalDetail || 'approval prompt';
      meta.approvalPending = true;
      meta.errorActive = false;
    }

    return { ...base, meta };
  }

  snapshot(nowMs = Date.now()) {
    return {
      approvalActive: this.approvalActive,
      approvalDetail: this.approvalDetail,
      errorActive: this.errorUntilMs > nowMs,
      errorDetail: this.errorDetail,
      errorUntilMs: this.errorUntilMs,
      transientErrorCount: this.transientErrorCount
    };
  }
}

export const __test = {
  stripTerminalControls,
  isApprovalDecisionInput,
  lastFreshPatternMatch
};
