# Phase 09 decision — Manager view modes and boxed visual hierarchy

**Date:** 2026-08-26  
**Status:** ACCEPTED product direction

## Decision

Session Manager will support multiple presentations over the same Phase 08 data/core. Changing view must not trigger a different collection model or deep-parse all history.

Canonical view modes:

```text
Operations
Table
Charts
Auto
```

### Operations

Default balanced operations-console direction for most users:

- LIVE sessions are visually prominent;
- context/events are easy to scan;
- token activity is available without dominating the screen;
- selected row has a visible lightweight preview;
- recent/session table remains available below.

Use a small number of large meaningful boxes. Avoid telemetry-wall density.

### Table

Power-user/index direction:

- session table is the primary surface;
- maximum useful responsive columns;
- compact summary remains visible;
- charts are secondary or omitted.

Use light framing so the table remains visually dominant.

### Charts

Visual control-room direction:

- boxed cards are intentionally stronger;
- primary cards are Context Pressure, Token Activity, Tool Activity, LIVE Sessions, Events and Storage as space allows;
- default visible primary charts remain bounded; do not add charts merely because an ultrawide terminal has spare space;
- additional chart types may exist later as a chart deck, but not all must be visible simultaneously.

### Auto

Responsive presentation policy, not a separate data model:

- narrow terminals favor compact/table presentation;
- normal/wide terminals favor Operations;
- ultrawide may use the richer Charts/control-room presentation when readable.

## Box hierarchy

Manager should feel like a futuristic local operations console without becoming box soup.

```text
normal panel   ┌ ─ ┐
focused panel  ╔ ═ ╗
```

Rules:

- Charts mode is box-heavy;
- Operations uses fewer, larger boxes;
- Table is box-light;
- focused panels use stronger framing;
- semantic color is supplemental; MONO must preserve meaning with text/symbols;
- no blinking/fake movement; movement comes only from real data changes.

## Navigation direction

`V` opens/cycles the Manager view mode during Phase 09 implementation. Final UX may use a small selector overlay.

Intended product UX after visual acceptance:

```text
first Manager use -> choose default view
later launches     -> remember default
V                  -> change view any time
```

Persistence/onboarding implementation can be sequenced after the visual layouts are accepted; it must not require a separate history database.

## Selected session interaction

Moving the session row must give immediate visible feedback through a selected preview where the active layout has room. `Enter` must never create an invisible state. Phase 09 may show a basic exact-session inspect summary; deeper selected-session analytics/timelines remain Phase 10.

## History/data rule

All modes consume the same indexed/lightweight rows. Global search/filter/sort must not deep-parse the entire session store. Deep parse remains selected-session-only.

## Non-goals

- no generic process/GPU/network dashboard;
- no pricing/cost;
- no fabricated historical time series;
- no destructive session actions in Phase 09.
