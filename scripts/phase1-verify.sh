#!/usr/bin/env sh
set -eu

printf '%s\n' '== Codex Monitor Phase 01 verification =='
major=$(node -p "Number(process.versions.node.split('.')[0])")
if [ "$major" -lt 20 ] || [ "$major" -ge 27 ]; then
  echo "Node.js 20-26 is required." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  npm install
fi

npm run verify:phase1
node ./src/cli/codexm.js --doctor
printf '%s\n' 'AUTO TEST: PASS'
printf '%s\n' 'Manual tests: docs/qa/phase-01/MANUAL-TEST-REQUIRED.md'
