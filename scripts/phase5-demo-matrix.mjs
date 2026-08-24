#!/usr/bin/env node
import { renderDemo } from '../src/ui/demo.js';

const CASES = [
  { name: 'NARROW LOGIN', width: 36, height: 18, preset: 'recommended', theme: 'color', state: 'tool', authMode: 'login' },
  { name: 'NORMAL LOGIN', width: 60, height: 24, preset: 'recommended', theme: 'color', state: 'thinking', authMode: 'login' },
  { name: 'TWO-LANE LOGIN', width: 90, height: 24, preset: 'recommended', theme: 'color', state: 'tool', authMode: 'login' },
  { name: 'WIDE LOGIN', width: 120, height: 35, preset: 'recommended', theme: 'color', state: 'approval', authMode: 'login' },
  { name: 'ULTRAWIDE FULL', width: 160, height: 35, preset: 'full', theme: 'color', state: 'error', authMode: 'login' },
  { name: 'API WIDE', width: 120, height: 35, preset: 'recommended', theme: 'color', state: 'idle', authMode: 'api' },
  { name: 'MATRIX WIDE', width: 120, height: 35, preset: 'full', theme: 'matrix', state: 'tool', authMode: 'login' },
  { name: 'MONO COMPACT', width: 72, height: 24, preset: 'compact', theme: 'mono', state: 'idle', authMode: 'login' }
];

for (const item of CASES) {
  process.stdout.write(`\n=== ${item.name} · ${item.width}x${item.height} · ${item.preset}/${item.theme}/${item.authMode} ===\n`);
  const frame = renderDemo(item);
  process.stdout.write(`${frame.lines.join('\n')}\n`);
}

process.stdout.write('\nPhase 05 demo matrix complete. Review readability, height, primary hierarchy and Custom direction.\n');
