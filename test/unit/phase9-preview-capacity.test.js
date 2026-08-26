import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activityPreviewCapacity } from '../../src/manager/activity-preview-capacity.js';
import { SelectedActivityPreview } from '../../src/manager/activity-preview.js';

function line(type, payload = {}, timestamp = '2026-08-26T12:00:00.000Z', outer = null) {
  const body = outer
    ? { type: outer, timestamp, payload: { type, ...payload } }
    : { type, timestamp, payload };
  return `${JSON.stringify(body)}\n`;
}

test('activity preview capacity follows the visible ultrawide pane', () => {
  const telemetry = { sessions: [{ id: 'a' }, { id: 'b' }] };
  assert.equal(activityPreviewCapacity({ width: 180, height: 42, viewMode: 'table', telemetry }), 0);

  const table = activityPreviewCapacity({ width: 260, height: 42, viewMode: 'table', telemetry });
  const operations = activityPreviewCapacity({ width: 260, height: 42, viewMode: 'operations', telemetry });
  const charts = activityPreviewCapacity({ width: 260, height: 42, viewMode: 'charts', telemetry });

  assert.ok(table > operations, `table preview should expose more rows than operations: ${table} <= ${operations}`);
  assert.ok(operations > charts, `operations preview should expose more rows than charts: ${operations} <= ${charts}`);
  assert.ok(charts > 0);
});

test('selected activity keeps only the visible target event count', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codexm-p9-preview-capacity-'));
  const filePath = path.join(root, 'session.jsonl');
  const rows = [];
  for (let index = 0; index < 80; index += 1) {
    const second = String(index % 60).padStart(2, '0');
    rows.push(line('user_message', { message: `message-${index}` }, `2026-08-26T12:00:${second}.000Z`, 'event_msg'));
  }
  fs.writeFileSync(filePath, rows.join(''));
  const stat = fs.statSync(filePath);
  const reader = new SelectedActivityPreview({ maxBytes: 16 * 1024, maxBackfillBytes: 64 * 1024, maxEvents: 32 });
  const row = { id: 'a', filePath, name: 'a', project: 'audit', fileSizeBytes: stat.size };

  const preview = reader.read(row, { nowMs: 1, targetEvents: 7 });
  assert.equal(preview.targetEvents, 7);
  assert.equal(preview.events.length, 7);
  assert.equal(preview.events.at(-1)?.label, 'message-79');

  fs.appendFileSync(filePath, line('user_message', { message: 'message-new' }, '2026-08-26T12:02:00.000Z', 'event_msg'));
  const grown = fs.statSync(filePath);
  const updated = reader.read({ ...row, fileSizeBytes: grown.size }, { nowMs: 2000, targetEvents: 7 });
  assert.equal(updated.events.length, 7);
  assert.equal(updated.events.at(-1)?.label, 'message-new');

  fs.rmSync(root, { recursive: true, force: true });
});
