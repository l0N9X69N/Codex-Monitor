# Codex Dog Animation — Phase Plan

> Mục đích: quản lý toàn bộ quá trình hoàn thiện mascot theo phase.
>
> Nguyên tắc chính:
>
> - Chỉ chuyển sang phase mới khi phase hiện tại đã đạt đầy đủ exit criteria.
> - Không sửa lan sang phase sau chỉ vì "tiện".
> - Mỗi phase phải có output rõ ràng để review.
> - Nếu phát hiện lỗi nền ở phase trước, quay lại phase đó trước khi tiếp tục.
> - `DOG_ANIMATION_REVIEW_CHECKLIST.md` là checklist chi tiết; file này chỉ quản lý tiến độ cấp phase.

---

# PHASE 0 — Foundation & Rules

## Mục tiêu

Chốt các quy tắc chung để mọi animation sau này dùng cùng một chuẩn.

## Phạm vi

- ASCII anatomy conventions.
- Head anchor.
- Tail convention.
- Ground baseline.
- Jump rules.
- Walk/run rules.
- Body-state naming.
- Preview/review workflow.
- Quy tắc không sửa nhiều file trong một lượt.

## Cần đạt

- [ ] Chốt 4 body states:
  - `normal`
  - `belly-1`
  - `belly-2`
  - `belly-max`
- [ ] Chốt tail:
  - neutral `(`
  - up `/(`
  - down `\(`
- [ ] Chốt head anchor.
- [ ] Chốt baseline.
- [ ] Chốt legs phải nằm hợp lý dưới body.
- [ ] Chốt jump = `ground -> up -> ground`.
- [ ] Chốt movement X do renderer, không vẽ từng ô.
- [ ] Chốt preview bằng full-frame ASCII, không chỉ diff.
- [ ] Chốt workflow: review -> approve -> edit -> verify.

## Exit criteria

Phase 0 PASS khi:

1. Không còn tranh luận về các quy tắc anatomy/motion cơ bản.
2. `DOG_BEHAVIOR_MAP.md` phản ánh đúng các quy tắc đã chốt.
3. Codex có thể review một file ASCII mà không tự sửa lan sang file khác.

## Status

- [ ] PASS

---

# PHASE 1 — Canonical Base Bodies

## Mục tiêu

Khóa 4 hình thể nền trước khi làm animation phức tạp.

## Phạm vi

- `animations/normal/_BASE.txt`
- `animations/belly-1/_BASE.txt`
- `animations/belly-2/_BASE.txt`
- `animations/belly-max/_BASE.txt`

## Thứ tự

1. `normal/_BASE.txt`
2. `belly-1/_BASE.txt`
3. `belly-2/_BASE.txt`
4. `belly-max/_BASE.txt`

## Cần đạt cho mỗi body state

- [ ] Head / muzzle ổn.
- [ ] Neck connection ổn.
- [ ] Back line ổn.
- [ ] Belly line ổn.
- [ ] Front legs ổn.
- [ ] Rear legs ổn.
- [ ] Feet / ground contact ổn.
- [ ] Tail root ổn.
- [ ] Tail neutral/up/down nhất quán.
- [ ] Blink không làm méo đầu.
- [ ] Head anchor ổn định.
- [ ] Silhouette đọc được ngay là cùng một con chó.

## Cross-body requirements

- [ ] Cùng một head/muzzle qua cả 4 body state.
- [ ] Belly tăng dần hợp lý.
- [ ] Legs dịch/chỉnh hợp lý theo body width.
- [ ] Tail root không thay đổi vô lý.
- [ ] `normal -> belly-1 -> belly-2 -> belly-max` đọc được như cùng một con chó béo dần.

## Exit criteria

Phase 1 PASS khi:

1. Cả 4 `_BASE.txt` đã được review bằng mắt.
2. Không còn lỗi anatomy rõ ràng.
3. Có thể dùng chúng làm reference cho mọi animation sau.
4. Không cần quay lại thay canonical silhouette trừ khi phát hiện bug thật.

## Status

- [x] PASS

---

# PHASE 2 — Idle / Living Behavior

## Mục tiêu

Làm cho chó sống động ngay cả khi Monitor không có event đặc biệt.

## Phạm vi

Cho cả 4 body states:

- `idle.stand-breathe`
- `idle.wander`
- `idle.sit`
- `idle.lick-paw`
- `idle.sniff`
- `idle.scratch`
- `idle.stretch`
- `idle.yawn`

## Cần đạt

- [ ] Có idle loop không đứng chết.
- [ ] Có ít nhất 3-5 hành vi idle khác nhau.
- [ ] Các action nối được về neutral pose.
- [ ] Không random ra action lặp vô duyên liên tục.
- [ ] Belly lớn hơn có movement nặng/chậm hơn hợp lý.
- [ ] Không action nào phá canonical anatomy.

## Exit criteria

Phase 2 PASS khi:

1. Chó có thể ở IDLE lâu mà vẫn nhìn sống động.
2. Không cần ảnh tĩnh kéo dài.
3. Mỗi body state đều có idle behavior tương ứng.
4. Các action nối được với nhau mà không giật silhouette.

## Status

- [ ] PASS

---

# PHASE 3 — Thinking Behavior

## Mục tiêu

Tạo personality riêng cho trạng thái THINKING.

## Signature behavior

`think.scratch-ear`

## Phạm vi

Cho cả 4 body states:

- `think.scratch-ear`
- `think.head-tilt`
- `think.pace`
- `think.look-up`
- blink
- ear twitch

## Cần đạt

- [ ] Gãi tai đọc được rõ ràng.
- [ ] Chân sau không biến dạng khi gãi.
- [ ] Head tilt không phá muzzle.
- [ ] Pace nối được sang scratch/head tilt.
- [ ] THINKING có nhiều variant nhưng vẫn cùng nghĩa.
- [ ] Signature scratch-ear xuất hiện đủ thường để user nhận biết state.

## Exit criteria

Phase 3 PASS khi:

1. Nhìn mascot có thể cảm nhận "đang suy nghĩ".
2. THINKING không giống IDLE hoặc TOOL.
3. Các body state đều giữ cùng personality.
4. Có thể để THINKING chạy lâu mà không nhàm.

## Status

- [ ] PASS

---

# PHASE 4 — Motion System

## Mục tiêu

Hoàn thiện cách chó di chuyển trong terminal.

## Phạm vi

Cho cả 4 body states:

- `motion.walk`
- `motion.trot`
- `motion.run`
- `motion.turn`
- `motion.explore`

## Renderer behavior

- Position X do code điều khiển.
- Không vẽ từng vị trí bằng tay.
- Terminal rộng hơn -> chó có thể di chuyển xa hơn.

## Cần đạt

- [ ] Walk gait ổn.
- [ ] Trot gait ổn.
- [ ] Run gait ổn.
- [ ] Turn ổn.
- [ ] Run trái/phải ổn.
- [ ] `walk -> trot -> run -> stop` không giật.
- [ ] Body càng béo chạy càng nặng/chậm hợp lý.
- [ ] Resize không làm chó ra khỏi viewport.
- [ ] Ultrawide có thể chạy từ đầu này sang đầu kia.

## Exit criteria

Phase 4 PASS khi:

1. Chó có thể di chuyển qua terminal bằng X offset.
2. Walk/run nhìn ra đúng gait, không giống chân lỗi.
3. Window resize không phá animation.
4. Cả 4 body state đều có motion usable.

## Status

- [ ] PASS

---

# PHASE 5 — Tool Activity

## Mục tiêu

Map tool execution thành hành vi chó dễ nhận biết.

## Phạm vi

- `tool.tail-chase` — generic tool signature.
- `tool.sniff-search` — read/search/grep.
- `tool.run` — shell/exec/active task.
- `tool.paw-ground` — write/edit.

## Cần đạt

- [ ] Tail chase đọc được là đuổi theo đuôi.
- [ ] Search đọc được là sniff/search.
- [ ] Exec đọc được là hoạt động mạnh/chạy.
- [ ] Edit/write có paw action riêng.
- [ ] Tool dài có thể chuyển giữa các action mà không nhàm.
- [ ] Tool behavior không làm thay đổi belly state.

## Exit criteria

Phase 5 PASS khi:

1. TOOL nhìn khác THINKING và IDLE.
2. Generic tool có signature rõ.
3. Tool subtype có thể chọn animation phù hợp.
4. Tool kéo dài vẫn có behavior variation.

## Status

- [ ] PASS

---

# PHASE 6 — Monitor Events

## Mục tiêu

Hoàn thiện các event/state quan trọng của Monitor.

## Phạm vi

- STREAMING / RESPONDING
- WAIT USER
- SUCCESS
- ERROR
- RATE LIMIT / NETWORK WAIT

## Actions

- `stream.trot`
- `stream.wag-walk`
- `wait.sit-look`
- `wait.paw-tap`
- `wait.yawn-lie`
- `success.happy-hop`
- `success.spin`
- `error.sad-sit`
- `error.ears-down`
- `rate.empty-bowl`

## Cần đạt

- [ ] WAIT USER nhìn ra đang chờ user.
- [ ] SUCCESS vui nhưng ngắn, one-shot.
- [ ] ERROR buồn nhưng không quá bi kịch.
- [ ] RATE LIMIT có behavior riêng.
- [ ] STREAMING khác THINKING.
- [ ] Event interrupt không phá current animation.

## Exit criteria

Phase 6 PASS khi:

1. Các monitor event chính có visual language riêng.
2. User nhìn mascot có thể đoán state tương đối đúng.
3. One-shot event chạy xong quay lại long-lived state ổn.

## Status

- [ ] PASS

---

# PHASE 7 — Context Growth / Eating

## Mục tiêu

Hoàn thiện cơ chế context tăng -> ăn -> béo lên.

## Phạm vi

- `normal/eat.txt`
- `belly-1/eat.txt`
- `belly-2/eat.txt`
- `belly-max/eat.txt`

## Lifecycle

```text
normal
  -> eat
  -> belly-1

belly-1
  -> eat
  -> belly-2

belly-2
  -> eat
  -> belly-max

belly-max
  -> stuffed reaction
  -> belly-max
```

## Cần đạt

- [ ] Food path rõ.
- [ ] Happy hop hợp lý.
- [ ] Nom/chew/gulp rõ.
- [ ] Mouth transition ổn.
- [ ] Tail phase ổn.
- [ ] Belly transition không teleport.
- [ ] Belly max không lớn thêm.
- [ ] Timing đủ vui nhưng không quá chậm.

## Exit criteria

Phase 7 PASS khi:

1. Context tăng qua threshold có animation ăn rõ ràng.
2. Chuyển belly state mượt.
3. 4 `eat.txt` đã được visual review chính thức.
4. `eat.js`/preview chạy đúng source mới.

## Status

- [ ] PASS

---

# PHASE 8 — Context Reduction / Poop Slim

## Mục tiêu

Context giảm/compact/reset -> chó ị -> gầy lại.

## Lifecycle

```text
belly-max -> belly-2
belly-2   -> belly-1
belly-1   -> normal
```

## Phạm vi

Cho các body state cần giảm cân:

- look around
- prepare/squat
- poop
- belly shrink
- kick-ground hoặc trot-away
- return to normal behavior

## Cần đạt

- [ ] Hành động đọc được nhưng không quá chi tiết.
- [ ] Poop representation nhỏ/comedic.
- [ ] Belly shrink khớp context thật.
- [ ] Compact lớn có thể chain nhiều slim step.
- [ ] Running bình thường không làm chó gầy.
- [ ] Normal không thể slim thêm.

## Exit criteria

Phase 8 PASS khi:

1. Context giảm được thể hiện rõ.
2. Body state sau animation khớp context thật.
3. Multi-step compact/reset hoạt động đúng.
4. Không có trường hợp mascot báo sai fullness.

## Status

- [ ] PASS

---

# PHASE 9 — Fatigue / Sleep / Wake

## Mục tiêu

Cho chó có stamina riêng và ngủ khi hoạt động lâu.

## Phạm vi

- energy system
- tired transition
- yawn
- lie down
- sleep breathing
- ear twitch
- Z/z pulse
- wake
- stretch
- shake

## Behavior

```text
active
 -> slower
 -> yawn
 -> lie down
 -> sleep
```

Nếu dùng sleep latch:

```text
sleeping = true
until reset-class event
```

## Cần đạt

- [ ] Energy giảm theo hoạt động.
- [ ] Energy recovery khi nghỉ.
- [ ] Sleep không thành ảnh tĩnh.
- [ ] Có breathe A/B.
- [ ] Có occasional ear twitch.
- [ ] Có wake animation.
- [ ] Reset đánh thức chó.
- [ ] Monitor state vẫn hiển thị bình thường khi mascot ngủ.

## Exit criteria

Phase 9 PASS khi:

1. Hoạt động lâu có thể dẫn tới mệt/ngủ.
2. Sleep loop vẫn sống động.
3. Wake/reset transition mượt.
4. Sleep system không che mất monitor state thật.

## Status

- [ ] PASS

---

# PHASE 10 — Behavior Scheduler

## Mục tiêu

Ghép các animation thành một con chó có hành vi liên tục.

## Phạm vi

- monitor state -> behavior pool
- weighted random
- cooldown
- event priority
- current behavior
- energy
- body state
- facing
- position

## Cần đạt

- [ ] IDLE weighted random.
- [ ] THINKING weighted random.
- [ ] TOOL weighted random/subtype mapping.
- [ ] WAIT behavior pool.
- [ ] Cooldown cho action dễ lặp.
- [ ] Không spam cùng animation liên tục.
- [ ] Event priority đúng.
- [ ] Safe frame-boundary interrupt.
- [ ] Neutral transition khi đổi long-lived state.

## Exit criteria

Phase 10 PASS khi:

1. Chó hoạt động liên tục mà không giống GIF loop cố định.
2. Random vẫn đúng nghĩa monitor state.
3. Event quan trọng interrupt đúng.
4. Behavior không tạo animation combination vô lý.

## Status

- [ ] PASS

---

# PHASE 11 — Preview / Renderer / Color

## Mục tiêu

Có tooling đủ tốt để review và chạy mascot ổn định.

## Phạm vi

- preview any file
- preview any action
- preview body state
- loop/once/speed
- sprite width
- ANSI-safe width
- color policy
- mono mode

## Cần đạt

- [ ] Preview một file bất kỳ.
- [ ] Preview một action cụ thể.
- [ ] Preview một body state.
- [ ] `--once`.
- [ ] `--speed`.
- [ ] Print frame name/state.
- [ ] Preserve leading/trailing spaces.
- [ ] Width tính đúng với ANSI.
- [ ] Mono mode.
- [ ] Accent color mode nếu dùng màu.
- [ ] Chó dùng terminal foreground mặc định nếu mono/auto.

## Exit criteria

Phase 11 PASS khi:

1. Có thể review mọi storyboard dễ dàng.
2. Renderer không phá spacing.
3. Color không phá alignment.
4. Chạy được trên terminal dark/light theme.

## Status

- [ ] PASS

---

# PHASE 12 — Integration & Stress Test

## Mục tiêu

Tích hợp vào Codex Monitor và kiểm tra hành vi thực tế.

## Phạm vi

- Monitor state mapping.
- Context thresholds.
- Resize.
- Long-running tools.
- Long thinking.
- Sleep/reset.
- Context growth/reduction.

## Stress tests

- [ ] Terminal hẹp.
- [ ] Terminal rộng.
- [ ] Ultrawide.
- [ ] Resize liên tục.
- [ ] IDLE lâu.
- [ ] THINKING lâu.
- [ ] TOOL lâu.
- [ ] TOOL liên tiếp.
- [ ] SUCCESS interrupt.
- [ ] ERROR interrupt.
- [ ] Context normal -> belly-max.
- [ ] Context belly-max -> normal.
- [ ] Fatigue -> sleep.
- [ ] Sleep -> reset -> wake.
- [ ] Rate limit/network wait.
- [ ] Không có terminal artifact/cursor issue.

## Exit criteria

Phase 12 PASS khi:

1. Mascot chạy ổn trong Monitor thật.
2. Không báo sai monitor/context state.
3. Không phá layout khi resize.
4. Không có animation loop lỗi rõ ràng.
5. Personality vẫn nhất quán sau thời gian dài.

## Status

- [ ] PASS

---

# PHASE 13 — V1 Freeze

## Mục tiêu

Đóng phiên bản animation v1.

## Cần chốt

- [ ] ASCII v1.
- [ ] Timing v1.
- [ ] Behavior weights v1.
- [ ] Energy values v1.
- [ ] Context thresholds v1.
- [ ] Color policy v1.
- [ ] Renderer behavior v1.
- [ ] Monitor mapping v1.
- [ ] Documentation/update checklist.

## Exit criteria

Phase 13 PASS khi:

1. Không còn blocker visual/behavior.
2. Mọi phase trước đều PASS.
3. Có thể coi mascot là feature hoàn chỉnh của Codex Monitor v1.

## Status

- [ ] PASS

---

# Phase Gate Summary

| Phase | Name | Status |
|---|---|---|
| 0 | Foundation & Rules | [ ] |
| 1 | Canonical Base Bodies | [ ] |
| 2 | Idle / Living Behavior | [ ] |
| 3 | Thinking Behavior | [ ] |
| 4 | Motion System | [ ] |
| 5 | Tool Activity | [ ] |
| 6 | Monitor Events | [ ] |
| 7 | Context Growth / Eating | [ ] |
| 8 | Context Reduction / Poop Slim | [ ] |
| 9 | Fatigue / Sleep / Wake | [ ] |
| 10 | Behavior Scheduler | [ ] |
| 11 | Preview / Renderer / Color | [ ] |
| 12 | Integration & Stress Test | [ ] |
| 13 | V1 Freeze | [ ] |

---

# Current Phase

```text
CURRENT PHASE: 2 — Idle / Living Behavior

Current target:
animations/normal/idle.txt

Rule:
Phase 1 canonical base bodies are approved and frozen. Begin Phase 2 work only after explicit task instruction.
```
