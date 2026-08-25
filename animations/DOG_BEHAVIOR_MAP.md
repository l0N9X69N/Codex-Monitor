# Codex Dog Behavior Map

> Status: DESIGN SPEC / ASCII drafts are intentionally editable.
> Branch: `v1-rearchitecture`

## 1. Goal

The dog is a small persistent creature, not a static status icon. Monitor state tells the dog what kind of behavior is appropriate, while body size, fatigue, position, facing and random micro-behaviors make it feel alive.

The dog should keep moving even when the monitor state does not change. Long-lived states use weighted behavior pools; important events use deterministic one-shot animations.

## 2. Orthogonal state axes

```text
monitorState    idle | thinking | tool | streaming | wait-user | success | error | rate-limit | compact | reset
bodyState       normal | belly-1 | belly-2 | belly-max
energy          0..100
position        x, y
facing          left | right
currentBehavior action id
sleeping        true | false
cooldowns       per behavior
```

Do NOT encode combinations such as `thinking-belly-2-blink`. Select monitor behavior and body sprite independently.

## 3. Four body states

| bodyState | Suggested context range | Meaning |
|---|---:|---|
| `normal` | 0-30% | light / fresh |
| `belly-1` | 30-55% | mildly full |
| `belly-2` | 55-80% | clearly full |
| `belly-max` | 80-100% | stuffed |

Thresholds are draft configuration values, not hard protocol.

Normal running does **not** make the dog thinner. Body size must reflect real context. Context reduction/compact/reset is what makes it slim down.

## 4. Monitor mapping

| Monitor situation | Primary dog behavior | Secondary/random behaviors |
|---|---|---|
| IDLE | relax / wander | blink, sit, lick paw, sniff, scratch, stretch, yawn |
| THINKING | scratch ear / head tilt | pace, look up, blink, ear twitch |
| TOOL generic | chase tail | short run, paw ground |
| TOOL read/search/grep | sniff-search | walk nose-down, ear perk |
| TOOL shell/exec | run/trot | chase tail |
| TOOL write/edit | paw/dig | short pace |
| STREAMING/RESPONDING | relaxed trot / wag-walk | blink, short walk |
| WAIT USER | sit/look toward user | head tilt, paw tap, yawn, lie down |
| SUCCESS | happy hop | fast wag, tiny spin/play bow |
| ERROR | sad sit / ears down | slow blink, look away |
| RATE LIMIT / NETWORK WAIT | inspect empty bowl | sit by bowl, yawn, lie down |
| CONTEXT GROWS | eat (one-shot) | happy hop before/after eating |
| CONTEXT REDUCED / COMPACT | poop-slim (one-shot) | look around, squat, kick ground, trot away |
| RESET | wake + stretch + shake | reset energy; if context shrinks, run poop-slim first/after wake |
| WIDE TERMINAL / RESIZE | explore available track | walk, trot, run across width |
| EXHAUSTED | sleep latch | breathing, tiny ear twitch, `Z` pulse |

## 5. Long-lived state behavior pools

### IDLE
Suggested weights:

```text
stand-breathe  28
wander         20
sit            12
lick-paw       10
sniff          10
scratch        8
stretch        7
yawn           5
```

### THINKING

```text
scratch-ear    30
head-tilt      25
pace           20
look-up        10
blink          10
ear-twitch      5
```

### TOOL
Default if tool subtype is unknown:

```text
tail-chase     45
run            25
sniff-search   20
paw-ground     10
```

### WAIT USER

```text
sit-look       45
head-tilt      20
paw-tap        15
yawn           10
lie-down       10
```

## 6. Event priority

Higher priority interrupts lower priority only at a safe frame boundary.

```text
1 reset / fatal cleanup
2 compact / context reduction
3 error / rate-limit
4 success
5 eat / context threshold crossed
6 tool event
7 monitor long-lived state behavior
8 micro modifiers (blink, ear twitch, tail wag)
```

## 7. Fatigue and sleep

Energy is hidden internal state. It is not context and is not shown as a number.

Suggested costs/recovery:

```text
stand-breathe   0
walk           -1
scratch        -1
thinking pace  -1
happy hop      -2
tail chase     -3
run            -4
sit            +1
lie down       +2
sleep          +5 tick
```

Behavior bands:

```text
energy 60-100 : lively pools allowed
energy 30-59  : fewer runs, more sit/walk
energy 10-29  : yawn, slow walk, lie down
energy 0-9    : transition to sleep
```

Once exhausted sleep begins, set `sleeping=true` and keep the dog asleep until a reset-class event. Monitor UI continues to show the real monitor status; only the mascot is asleep.

Wake sequence:

```text
ear twitch -> eyes open -> head up -> stretch -> shake -> stand
```

Reset sets energy back to 100.

## 8. Context / belly lifecycle

Context growth crosses thresholds:

```text
normal   --eat--> belly-1
belly-1  --eat--> belly-2
belly-2  --eat--> belly-max
belly-max --eat--> stays belly-max (stuffed reaction only)
```

Context reduction:

```text
belly-max --poop-slim--> belly-2
belly-2   --poop-slim--> belly-1
belly-1   --poop-slim--> normal
```

Large compact/reset may chain multiple slim steps. Keep the poop representation tiny and comedic, not detailed.

## 9. Wide terminal movement

Do not draw every terminal cell. A frame is a sprite; code changes `x`.

```text
renderLine = " ".repeat(x) + spriteLine
maxX = availableWidth - spriteWidth
```

Draft movement policy:

```text
< 40 cols  : local actions only
40-69      : short walk
70-109     : wander/trot
>= 110     : full run across the lower track may be selected
```

On resize wider, the dog can notice/explore the new space. On resize narrower, clamp `x` safely; never teleport outside the viewport.

## 10. Canonical action IDs

```text
idle.stand-breathe
idle.wander
idle.sit
idle.lick-paw
idle.sniff
idle.scratch
idle.stretch
idle.yawn

think.scratch-ear
think.head-tilt
think.pace
think.look-up

tool.tail-chase
tool.sniff-search
tool.run
tool.paw-ground

stream.trot
stream.wag-walk
wait.sit-look
wait.paw-tap
wait.yawn-lie
success.happy-hop
success.spin
error.sad-sit
error.ears-down
rate.empty-bowl

context.eat
context.poop-slim
reset.wake-stretch

motion.walk
motion.trot
motion.run
motion.turn
motion.explore

sleep.lie-down
sleep.breathe
sleep.ear-twitch

mod.blink
mod.double-blink
mod.tail-slow
mod.tail-fast
mod.ear-twitch
```

## 11. File layout

```text
animations/
├─ DOG_BEHAVIOR_MAP.md
├─ normal/
├─ belly-1/
├─ belly-2/
└─ belly-max/
```

Each body folder has the same files:

```text
_BASE.txt
idle.txt
thinking.txt
tools.txt
events.txt
context.txt
motion-rest.txt
```

The same action ID must exist conceptually in all four body states, even if a heavier dog moves slower or uses fewer hops.

Existing `eat_preview.txt` + `eat.js` remain a working prototype/reference until the new body-state loader is implemented.

## 12. ASCII rules

1. Monospace only.
2. Keep a stable head anchor within an action unless the whole dog intentionally jumps.
3. Tail convention: neutral `(`, wag up `/(`, wag down `\(` where anatomy allows.
4. Blink should alter as few characters as possible.
5. A jump must read as `ground -> up -> ground`; do not merely delete legs.
6. Belly expands down/back; legs remain under the body.
7. Walking/running position is code-driven; keyframes only describe gait.
8. Difficult sketches in body folders are marked `DRAFT`; edit freely after visual review.
