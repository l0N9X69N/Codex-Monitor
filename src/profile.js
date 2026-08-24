import process from 'node:process';

export const PROFILES = Object.freeze({
  'l-a': Object.freeze({ id: 'l-a', ui: 'lite', auth: 'api', label: 'Lite · API key', command: 'codexm-l-a' }),
  'l-l': Object.freeze({ id: 'l-l', ui: 'lite', auth: 'login', label: 'Lite · Login', command: 'codexm-l-l' }),
  'f-a': Object.freeze({ id: 'f-a', ui: 'full', auth: 'api', label: 'Full · API key', command: 'codexm-f-a' }),
  'f-l': Object.freeze({ id: 'f-l', ui: 'full', auth: 'login', label: 'Full · Login', command: 'codexm-f-l' })
});

export const DEFAULT_PROFILE_ID = 'f-l';

export function resolveProfile(value = process.env.CODEXM_PROFILE) {
  const key = String(value || DEFAULT_PROFILE_ID).trim().toLowerCase();
  return PROFILES[key] || PROFILES[DEFAULT_PROFILE_ID];
}

export function codexAuthConfigValue(profile) {
  return profile?.auth === 'api' ? 'api' : 'chatgpt';
}

export function codexArgsForProfile(profile, args = []) {
  const method = codexAuthConfigValue(profile);
  // Codex exposes forced_login_method in config.toml. Supplying it as a
  // command-line config override makes the four launcher names deterministic
  // without changing the user's persistent Codex config.
  return ['-c', `forced_login_method='${method}'`, ...args];
}

export function childEnvironmentForProfile(profile, env = process.env) {
  const child = { ...env };

  if (profile?.auth === 'api') {
    // Current Codex supports CODEX_API_KEY for ephemeral API-key auth. Accept
    // OPENAI_API_KEY as a convenience and mirror it only in the child process.
    if (!child.CODEX_API_KEY && child.OPENAI_API_KEY) {
      child.CODEX_API_KEY = child.OPENAI_API_KEY;
    }
  } else {
    // CODEX_API_KEY has precedence when Codex enables env auth. Do not let an
    // ambient API key accidentally override the explicit Login profile.
    delete child.CODEX_API_KEY;
  }

  child.CODEXM_PROFILE = profile?.id || DEFAULT_PROFILE_ID;
  return child;
}

export function authSourceSummary(profile, env = process.env) {
  if (profile?.auth !== 'api') return 'ChatGPT login';
  if (env.CODEX_API_KEY) return 'CODEX_API_KEY';
  if (env.OPENAI_API_KEY) return 'OPENAI_API_KEY';
  return 'stored/API login';
}
