import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFreshInstallOnboarding } from '../../src/config/first-run.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../../src/config/schema.js';
import { loadMonitorConfig, saveMonitorConfig } from '../../src/config/store.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-phase13-first-run-'));
}

test('fresh install re-arms onboarding while preserving existing Monitor preferences', () => {
  const root = tempRoot();
  const filePath = path.join(root, 'config.json');
  try {
    const existing = normalizeConfig({
      ...DEFAULT_CONFIG,
      setupComplete: true,
      theme: 'matrix',
      background: 'black',
      systemMode: 'off',
      sections: { ...DEFAULT_CONFIG.sections, system: false },
      metrics: { ...DEFAULT_CONFIG.metrics, system: false },
      manager: { view: 'charts' },
      archive: { ...DEFAULT_CONFIG.archive, enabled: true }
    });
    saveMonitorConfig(existing, { filePath });

    const result = prepareFreshInstallOnboarding({ filePath });
    assert.equal(result.changed, true);
    assert.equal(result.reason, 'fresh-install-onboarding-armed');

    const loaded = loadMonitorConfig({ filePath });
    assert.equal(loaded.config.setupComplete, false);
    assert.equal(loaded.config.theme, 'matrix');
    assert.equal(loaded.config.background, 'black');
    assert.equal(loaded.config.systemMode, 'off');
    assert.equal(loaded.config.manager.view, 'charts');
    assert.equal(loaded.config.archive.enabled, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fresh install with no Monitor config leaves disk untouched for explicit onboarding Save', () => {
  const root = tempRoot();
  const filePath = path.join(root, 'config.json');
  try {
    const result = prepareFreshInstallOnboarding({ filePath });
    assert.equal(result.changed, false);
    assert.equal(result.reason, 'no-existing-config');
    assert.equal(fs.existsSync(filePath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fresh install does not rewrite malformed preserved config', () => {
  const root = tempRoot();
  const filePath = path.join(root, 'config.json');
  try {
    const original = '{broken-json';
    fs.writeFileSync(filePath, original);
    const result = prepareFreshInstallOnboarding({ filePath });
    assert.equal(result.changed, false);
    assert.equal(result.reason, 'config-recovery-required');
    assert.equal(fs.readFileSync(filePath, 'utf8'), original);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('recommended defaults expose System telemetry in automatic layout mode', () => {
  const config = normalizeConfig(DEFAULT_CONFIG);
  assert.equal(config.preset, 'recommended');
  assert.equal(config.systemMode, 'auto');
  assert.equal(config.sections.system, true);
  assert.equal(config.metrics.system, true);
  assert.equal(config.setupComplete, false);
});
