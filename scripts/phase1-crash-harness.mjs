import { detectAuth } from '../src/core/auth.js';
import { resolveCodexExecutable } from '../src/platform/pty.js';
import { runCodexLive } from '../src/runtime/live-runner.js';

const codexPath = resolveCodexExecutable();
if (!codexPath) {
  console.error('Official Codex CLI not found.');
  process.exit(2);
}

const auth = detectAuth({ codexPath });
console.log('Phase 01 crash harness: Codex will start, then an injected monitor failure will fire after 1500 ms.');
console.log('Expected: wrapper exits and the terminal immediately behaves normally afterward.');

try {
  await runCodexLive({ codexPath, auth, faultAfterStartMs: 1500 });
} catch {
  // Expected fault path. Terminal restoration is the behavior under test.
}
