const ANSI_CSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const ANSI_OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizeText(value, { maxLength = 200 } = {}) {
  if (value == null) return null;
  const cleaned = String(value)
    .replace(ANSI_OSC_RE, '')
    .replace(ANSI_CSI_RE, '')
    .replace(CONTROL_RE, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.length > maxLength ? `${cleaned.slice(0, Math.max(0, maxLength - 3))}...` : cleaned;
}

export function sanitizeDetail(value) {
  return sanitizeText(value, { maxLength: 160 });
}
