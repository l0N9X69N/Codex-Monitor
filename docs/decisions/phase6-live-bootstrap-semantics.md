# Phase 06 decision — Live bootstrap and resume semantics

Status: accepted for the v1 implementation baseline.

This decision explicitly supersedes the stricter parts of `PROJECT-SPEC.md` section 4 that required every Login quota/session metric to begin as `--` on every `codexm` process start.

The invariant is now **no cross-session telemetry contamination**, not **discard all locally known durable state**.

## Account-scoped quota

Login `5H` and `WEEK` are account-scoped values, not session-owned counters.

On Live Monitor startup:

- Codex Monitor may bootstrap each quota window independently from the newest valid local Codex JSONL evidence available for that account/runtime.
- This bootstrap is local-only and must not perform a network request.
- The bootstrap must update only account quota fields; it must not alter Session freshness, Context, Usage, Activity, or turn counters.
- A newer quota snapshot emitted by the newly attached/current Codex session supersedes bootstrap values naturally.
- If no valid local evidence exists for a window, that window remains `waiting`/`--`.
- API mode must never bootstrap or display Login quota as valid.

## New session

For a genuinely new Codex session:

- account quota may be bootstrapped as above;
- Context, Usage, Cache, turn counters, thread/session ID, compaction, tools, retry/error and actual model remain unknown until the new session supplies valid evidence;
- previous session telemetry must never fill those fields.

## Resume session

When the official Codex command is `resume` and Codex selects/appends to an existing rollout:

- that resumed rollout becomes the current session;
- Codex Monitor may hydrate durable telemetry from the pre-existing portion of exactly that rollout before following newly appended events;
- durable examples include Context, token Usage/Cache/Input/Output/Reasoning, turn count, thread ID, model/reasoning settings and compaction state;
- account quota still follows the account-scoped rule above and should keep a newer account snapshot over an older quota event replayed from the resumed session.

Transient state is never hydrated as active state. After resume bootstrap, reset:

- Activity to `IDLE` / waiting input;
- `approvalPending` to false;
- active/current tools to empty/null;
- active error state to false;
- in-progress turn/current turn ID/start timestamp to inactive/null.

Only events appended after the resumed run becomes current may activate THINKING/TOOL/APPROVAL/ERROR again.

## Performance rule

Bootstrap work runs once at startup/bind time. It must not introduce a high-frequency project/session scan. If replay of very large resumed sessions proves materially slow in real testing, optimize with bounded reverse scanning/checkpoints while preserving these semantics rather than returning to cross-session guessing.
