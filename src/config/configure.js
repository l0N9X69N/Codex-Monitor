import { applyArchiveConfigSideEffects } from './archive-effects.js';
import { normalizeConfig } from './schema.js';
import { saveMonitorConfig } from './store.js';
import { runStandaloneConfigTui } from './tui.js';

export async function configureMonitor({
  input = process.stdin,
  output = process.stdout,
  processRef = process,
  currentConfig,
  previousConfig = currentConfig,
  filePath,
  save = saveMonitorConfig,
  applyArchiveEffects = applyArchiveConfigSideEffects,
  colorCapability,
  theme,
  notice = ''
} = {}) {
  const result = await runStandaloneConfigTui({
    stdin: input,
    stdout: output,
    processRef,
    currentConfig: normalizeConfig(currentConfig),
    previousConfig: normalizeConfig(previousConfig),
    filePath,
    save,
    applyArchiveEffects,
    notice,
    ...(colorCapability ? { colorCapability } : {}),
    ...(theme ? { theme } : {})
  });

  if (result.error && result.code !== 0) {
    output?.write?.(`${result.error.message}\n`);
  }
  return result;
}
