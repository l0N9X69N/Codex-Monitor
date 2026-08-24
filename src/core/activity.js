export const ACTIVITY_PRIORITY = Object.freeze({
  IDLE: 0,
  THINKING: 1,
  TOOL: 2,
  APPROVAL: 3,
  ERROR: 4
});

export function resolveActivityState({
  error = false,
  approval = false,
  tool = false,
  thinking = false
} = {}) {
  if (error) return 'ERROR';
  if (approval) return 'APPROVAL';
  if (tool) return 'TOOL';
  if (thinking) return 'THINKING';
  return 'IDLE';
}
