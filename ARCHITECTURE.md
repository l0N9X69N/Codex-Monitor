# Codex Monitor v1 architecture

## Command matrix

```text
codexm-l-a  = lite UI + API-key auth profile
codexm-l-l  = lite UI + ChatGPT-login auth profile
codexm-f-a  = full UI + API-key auth profile
codexm-f-l  = full UI + ChatGPT-login auth profile
codexm      = codexm-f-l
```

All commands launch the same official Codex CLI. The four entry points only
select monitor presentation and a child-process auth profile.

## Runtime

```text
shell
  -> npm command shim
    -> codexm.js
      -> profile.js
      -> ConPTY
        -> official codex
```

The wrapper reserves terminal rows below Codex using DECSTBM so the Codex scroll
region and the monitor do not overwrite each other.

## State sources

```text
~/.codex/sessions/**/rollout-*.jsonl
  -> quota.js
  -> durable state: tokens, quota, context, turn lifecycle, persisted tools

Codex ConPTY stream
  -> transient.js
  -> transient state: approval overlay, terminal error

merged state
  -> priority ERROR > APPROVAL > TOOL > THINKING > IDLE
  -> render.js (lite) or render-full.js (full)
```

No monitor-specific network request is required.

## Full renderer

The full renderer is active when:

- the selected profile uses `ui=full`;
- terminal width is at least 120 columns;
- terminal height is at least 18 rows.

Otherwise the renderer falls back to lite automatically.

The four full panels are:

1. CONTEXT
2. USAGE
3. SESSION
4. CURRENT ACTIVITY

## Authentication profiles

`profile.js` injects a temporary Codex config override:

- Login: `forced_login_method="chatgpt"`
- API: `forced_login_method="api"`

For API profiles, `OPENAI_API_KEY` is mirrored to `CODEX_API_KEY` only when
`CODEX_API_KEY` is not already present. For Login profiles, `CODEX_API_KEY` is
removed only from the child environment.

No persistent Codex config file is modified.

## Installation

The installer runs `npm pack` and globally installs the generated tarball. It
does not use a permanent global npm link to the cloned source tree.
