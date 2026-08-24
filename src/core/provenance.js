export const PROVENANCE = Object.freeze({
  OFFICIAL_CURRENT: 'official-current',
  LOCAL: 'local',
  DERIVED: 'derived',
  UNKNOWN: 'unknown'
});

export function provenanceEntry(source = PROVENANCE.UNKNOWN, observedAtMs = null, evidence = null) {
  return {
    source,
    observedAtMs: Number.isFinite(observedAtMs) ? observedAtMs : null,
    evidence: typeof evidence === 'string' && evidence ? evidence : null
  };
}

export function isOfficialCurrent(entry) {
  return entry?.source === PROVENANCE.OFFICIAL_CURRENT;
}

export function isDerived(entry) {
  return entry?.source === PROVENANCE.DERIVED;
}
