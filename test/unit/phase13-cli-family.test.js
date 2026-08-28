import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { monitorHelp, managerHelp, configHelp, controlHelp } from '../../src/cli/help.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('package exposes the dedicated Codex Monitor command family', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.bin, {
    codexm: './src/cli/codexm.js',
    codexmm: './src/cli/codexmm.js',
    codexmc: './src/cli/codexmc.js',
    codexmh: './src/cli/codexmh.js',
    codexmctl: './src/cli/codexmctl.js'
  });
});

test('Monitor help follows the persisted UI language choice', () => {
  const vi = monitorHelp('vi');
  const en = monitorHelp('en');
  assert.match(vi, /LỆNH HÀNG NGÀY/);
  assert.match(vi, /Chạy Codex với Live Monitor/);
  assert.match(en, /DAILY COMMANDS/);
  assert.match(en, /Run Codex with Live Monitor/);
});

test('context help is bilingual for Manager, Config and maintenance', () => {
  assert.match(managerHelp('vi'), /Mở Session Manager/);
  assert.match(managerHelp('en'), /Open Session Manager/);
  assert.match(configHelp('vi'), /Mở cấu hình dùng chung/);
  assert.match(configHelp('en'), /Open shared Config/);
  assert.match(controlHelp('vi'), /Chẩn đoán Monitor\/Archive/);
  assert.match(controlHelp('en'), /Diagnose Monitor\/Archive/);
});

test('Monitor help documents that codexm flags belong to official Codex', () => {
  for (const language of ['vi', 'en']) {
    const output = monitorHelp(language);
    assert.match(output, /codexm -h, -v, -m, -c, --help, --version/);
    assert.match(output, /codexmm/);
    assert.match(output, /codexmc/);
    assert.match(output, /codexmctl/);
  }
});
