import readline from 'node:readline/promises';
import { stdin as defaultInput, stdout as defaultOutput } from 'node:process';
import { configForPreset, normalizeConfig, CONFIG_VALUES } from './schema.js';
import { saveMonitorConfig } from './store.js';

function parseList(answer, allowed, fallback) {
  const text = String(answer ?? '').trim();
  if (!text) return [...fallback];
  return [...new Set(text.split(',').map((item) => item.trim().toLowerCase()).filter((item) => allowed.has(item)))];
}

function yesNo(answer, fallback = false) {
  const value = String(answer ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return ['y', 'yes', '1', 'true', 'on', 'c', 'co', 'có'].includes(value);
}

export async function configureMonitor({
  input = defaultInput,
  output = defaultOutput,
  currentConfig,
  filePath,
  save = saveMonitorConfig
} = {}) {
  const rl = readline.createInterface({ input, output });
  try {
    let config = normalizeConfig(currentConfig);
    output.write('\nCodex Monitor configuration\n\n');

    const language = (await rl.question(`Language [vi/en] (${config.language}): `)).trim().toLowerCase();
    if (CONFIG_VALUES.languages.has(language)) config.language = language;

    const preset = (await rl.question(`Preset [recommended/compact/full/custom] (${config.preset}): `)).trim().toLowerCase();
    if (CONFIG_VALUES.presets.has(preset)) config = normalizeConfig(configForPreset(preset, config));

    if (config.preset === 'custom') {
      output.write('\nSections / Metrics\n');
      for (const section of CONFIG_VALUES.sections) {
        const answer = await rl.question(`${section} [y/n] (${config.sections[section] ? 'y' : 'n'}): `);
        config.sections[section] = yesNo(answer, config.sections[section]);
      }

      const enabledMetrics = Object.entries(config.metrics).filter(([, enabled]) => enabled).map(([key]) => key);
      const metrics = await rl.question(`Metrics comma-separated (${enabledMetrics.join(',')}): `);
      if (metrics.trim()) {
        const chosen = new Set(parseList(metrics, CONFIG_VALUES.metrics, enabledMetrics));
        for (const key of CONFIG_VALUES.metrics) config.metrics[key] = chosen.has(key);
      }
    }

    output.write('\nLive Tabs\n');
    const tabs = await rl.question(`Tabs comma-separated (${config.tabs.join(',')}): `);
    const nextTabs = parseList(tabs, CONFIG_VALUES.tabs, config.tabs);
    if (nextTabs.length) config.tabs = nextTabs;

    output.write('\nHeader — select up to 4\n');
    const header = await rl.question(`Header comma-separated (${config.header.join(',')}): `);
    config.header = parseList(header, CONFIG_VALUES.header, config.header).slice(0, 4);

    const theme = (await rl.question(`Theme [color/mono/matrix] (${config.theme}): `)).trim().toLowerCase();
    if (CONFIG_VALUES.themes.has(theme)) config.theme = theme;

    config = normalizeConfig(config);
    output.write('\nPreview config\n');
    output.write(`${JSON.stringify(config, null, 2)}\n`);
    const confirm = await rl.question('Save? [Y/n]: ');
    if (String(confirm).trim() && !yesNo(confirm, true)) return { saved: false, config };

    const result = save(config, { filePath });
    output.write(`Saved: ${result.filePath}\n`);
    return { saved: true, ...result };
  } finally {
    rl.close();
  }
}
