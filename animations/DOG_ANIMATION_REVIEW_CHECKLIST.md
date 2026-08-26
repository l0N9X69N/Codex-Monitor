# Codex Dog Animation — Review Checklist

> Checklist tổng cho việc review/chỉnh ASCII animation. Làm từ từ, mỗi lượt chỉ review một phần nhỏ.
>
> Cấu trúc hiện tại:
>
> - `animations/normal/`
> - `animations/belly-1/`
> - `animations/belly-2/`
> - `animations/belly-max/`

## Quy ước

- `[ ]` Chưa review/chưa chốt.
- `[x]` Đã review và chốt.
- Chỉ tick một file khi toàn bộ frame bên trong đã được print/preview và review bằng mắt.
- `eat.txt` đã có storyboard từ prototype cũ nhưng vẫn cần review chính thức.
- Codex phải print toàn bộ ASCII frame khi review, không chỉ đưa diff.

---

# 0. Luật chung

- [ ] Chốt head / muzzle canonical.
- [ ] Chốt neck connection.
- [ ] Chốt back line.
- [ ] Chốt belly line.
- [ ] Chốt front legs.
- [ ] Chốt rear legs.
- [ ] Chốt feet / ground contact.
- [ ] Chốt tail root.
- [ ] Chốt tail neutral / up / down.
- [ ] Chốt blink.
- [ ] Chốt head anchor.
- [ ] Chốt baseline / mặt đất.
- [ ] Chốt chiều cao tối đa sprite.
- [ ] Chốt quy tắc body nở khi tăng belly.
- [ ] Chốt legs luôn nằm hợp lý dưới body.
- [ ] Chốt jump: `ground -> up -> ground`.
- [ ] Chốt walk/run: gait do frame, vị trí X do code.
- [ ] Chốt cách quay/lật trái-phải.
- [ ] Chốt color policy sau khi ASCII đã ổn.

---

# 1. `animations/normal/`

## 1.1 `_BASE.txt` — làm đầu tiên

- [x] Neutral/base silhouette.
- [x] Head / muzzle.
- [x] Neck connection.
- [x] Back line.
- [x] Belly line.
- [x] Tail root.
- [x] Tail neutral.
- [x] Tail up.
- [x] Tail down.
- [x] Front legs.
- [x] Rear legs.
- [x] Feet / ground contact.
- [x] Blink pose.
- [x] Head anchor consistency.
- [x] Silhouette consistency giữa các pose.
- [x] Print toàn bộ base poses và review lần cuối.
- [x] Chốt `normal/_BASE.txt`.

## 1.2 `idle.txt`

- [ ] `idle.stand-breathe`.
  - [ ] breathe A.
  - [ ] breathe B.
  - [ ] loop tự nhiên.
- [ ] `idle.wander`.
- [ ] `idle.sit`.
  - [ ] stand -> sit.
  - [ ] sitting loop.
  - [ ] sit -> stand.
- [ ] `idle.lick-paw`.
  - [ ] chuẩn bị.
  - [ ] nhấc chân.
  - [ ] cúi đầu.
  - [ ] lick A/B.
  - [ ] hạ chân.
- [ ] `idle.sniff`.
- [ ] `idle.scratch`.
- [ ] `idle.stretch`.
- [ ] `idle.yawn`.
- [ ] Kiểm tra random idle nối giữa các action không bị giật.
- [ ] Chốt `normal/idle.txt`.

## 1.3 `thinking.txt`

- [ ] `think.scratch-ear` — signature THINKING.
  - [ ] neutral.
  - [ ] nhấc chân sau.
  - [ ] scratch A.
  - [ ] scratch B.
  - [ ] scratch A.
  - [ ] hạ chân.
  - [ ] trở lại neutral.
- [ ] `think.head-tilt`.
- [ ] `think.pace`.
- [ ] `think.look-up`.
- [ ] Blink xen giữa thinking.
- [ ] Ear twitch xen giữa thinking.
- [ ] Các thinking action nối ngẫu nhiên được với nhau.
- [ ] Chốt `normal/thinking.txt`.

## 1.4 `tools.txt`

- [ ] `tool.tail-chase`.
  - [ ] chuẩn bị.
  - [ ] chase/turn A.
  - [ ] chase/turn B.
  - [ ] chase/turn C.
  - [ ] return.
- [ ] `tool.sniff-search`.
- [ ] `tool.run`.
- [ ] `tool.paw-ground`.
- [ ] Tool animation không làm sai body state.
- [ ] Chốt `normal/tools.txt`.

## 1.5 `events.txt`

- [ ] `stream.trot`.
- [ ] `stream.wag-walk`.
- [ ] `wait.sit-look`.
- [ ] `wait.paw-tap`.
- [ ] `wait.yawn-lie`.
- [ ] `success.happy-hop`.
  - [ ] ground.
  - [ ] up.
  - [ ] ground.
- [ ] `success.spin`.
- [ ] `error.sad-sit`.
- [ ] `error.ears-down`.
- [ ] `rate.empty-bowl`.
- [ ] WAIT kéo dài vẫn sống động.
- [ ] SUCCESS là one-shot.
- [ ] ERROR không làm méo anatomy.
- [ ] Chốt `normal/events.txt`.

## 1.6 `context.txt`

- [ ] `context.poop-slim` khi normal đã là mức gầy nhất.
- [ ] Reaction khi context giảm nhưng không thể gầy thêm.
- [ ] `reset.wake-stretch`.
  - [ ] ear twitch.
  - [ ] eyes open.
  - [ ] head up.
  - [ ] stretch.
  - [ ] shake.
  - [ ] stand.
- [ ] Reset khi đang thức.
- [ ] Reset khi đang ngủ.
- [ ] Chốt `normal/context.txt`.

## 1.7 `eat.txt`

- [ ] IDLE.
- [ ] BLINK.
- [ ] EYES OPEN.
- [ ] FOOD APPEARS.
- [ ] FOOD CLOSER.
- [ ] EAT NOM.
- [ ] CHEW.
- [ ] CHEW 2.
- [ ] GULP.
- [ ] Kiểm tra hop/jump chân.
- [ ] Kiểm tra food path.
- [ ] Kiểm tra mouth `; -> : -> o`.
- [ ] Kiểm tra tail phase.
- [ ] Kiểm tra transition sang `belly-1`.
- [ ] Chốt `normal/eat.txt`.

## 1.8 `motion-rest.txt`

- [ ] `motion.walk`.
- [ ] `motion.trot`.
- [ ] `motion.run`.
- [ ] `motion.turn`.
- [ ] `motion.explore`.
- [ ] walk -> trot.
- [ ] trot -> run.
- [ ] run -> stop.
- [ ] chạy trái/phải.
- [ ] `sleep.lie-down`.
- [ ] `sleep.breathe` A/B.
- [ ] `sleep.ear-twitch`.
- [ ] `Z/z` pulse nếu dùng.
- [ ] Sleep loop luôn có chuyển động nhỏ.
- [ ] Chốt `normal/motion-rest.txt`.

---

# 2. `animations/belly-1/`

## 2.1 `_BASE.txt`

- [x] Canonical belly-1 silhouette.
- [x] Head anchor so với normal.
- [x] Body width.
- [x] Belly depth.
- [x] Front/rear legs dưới body.
- [x] Tail root.
- [x] Tail neutral/up/down.
- [x] Blink.
- [x] Ground contact.
- [x] Chốt `belly-1/_BASE.txt`.

## 2.2 `idle.txt`

- [ ] stand-breathe.
- [ ] wander.
- [ ] sit.
- [ ] lick-paw.
- [ ] sniff.
- [ ] scratch.
- [ ] stretch.
- [ ] yawn.
- [ ] Chuyển động hợp lý với body nặng hơn normal.
- [ ] Chốt `belly-1/idle.txt`.

## 2.3 `thinking.txt`

- [ ] scratch-ear.
- [ ] head-tilt.
- [ ] pace.
- [ ] look-up.
- [ ] blink / ear twitch.
- [ ] Chốt `belly-1/thinking.txt`.

## 2.4 `tools.txt`

- [ ] tail-chase.
- [ ] sniff-search.
- [ ] run.
- [ ] paw-ground.
- [ ] Chốt `belly-1/tools.txt`.

## 2.5 `events.txt`

- [ ] stream.trot.
- [ ] stream.wag-walk.
- [ ] wait.sit-look.
- [ ] wait.paw-tap.
- [ ] wait.yawn-lie.
- [ ] success.happy-hop.
- [ ] success.spin.
- [ ] error.sad-sit.
- [ ] error.ears-down.
- [ ] rate.empty-bowl.
- [ ] Chốt `belly-1/events.txt`.

## 2.6 `context.txt`

- [ ] poop-slim `belly-1 -> normal`.
- [ ] squat/readability.
- [ ] poop tiny/comedic.
- [ ] kick-ground/trot-away nếu dùng.
- [ ] wake/stretch/reset.
- [ ] Chốt `belly-1/context.txt`.

## 2.7 `eat.txt`

- [ ] IDLE.
- [ ] BLINK.
- [ ] EYES OPEN.
- [ ] FOOD APPEARS.
- [ ] FOOD CLOSER.
- [ ] EAT NOM.
- [ ] CHEW.
- [ ] CHEW 2.
- [ ] GULP.
- [ ] Transition `belly-1 -> belly-2`.
- [ ] Chốt `belly-1/eat.txt`.

## 2.8 `motion-rest.txt`

- [ ] walk.
- [ ] trot.
- [ ] run.
- [ ] turn.
- [ ] explore.
- [ ] lie-down.
- [ ] sleep breathing.
- [ ] sleep ear twitch.
- [ ] Gait hơi nặng hơn normal.
- [ ] Chốt `belly-1/motion-rest.txt`.

---

# 3. `animations/belly-2/`

## 3.1 `_BASE.txt`

- [x] Canonical belly-2 silhouette.
- [x] Head anchor.
- [x] Body width/depth.
- [x] Belly curve.
- [x] Legs dưới body.
- [x] Tail root.
- [x] Tail neutral/up/down.
- [x] Blink.
- [x] Ground contact.
- [x] Chốt `belly-2/_BASE.txt`.

## 3.2 `idle.txt`

- [ ] stand-breathe.
- [ ] wander.
- [ ] sit.
- [ ] lick-paw.
- [ ] sniff.
- [ ] scratch.
- [ ] stretch.
- [ ] yawn.
- [ ] Chuyển động nặng hơn belly-1.
- [ ] Chốt `belly-2/idle.txt`.

## 3.3 `thinking.txt`

- [ ] scratch-ear.
- [ ] head-tilt.
- [ ] pace.
- [ ] look-up.
- [ ] blink / ear twitch.
- [ ] Chốt `belly-2/thinking.txt`.

## 3.4 `tools.txt`

- [ ] tail-chase.
- [ ] sniff-search.
- [ ] run.
- [ ] paw-ground.
- [ ] Chốt `belly-2/tools.txt`.

## 3.5 `events.txt`

- [ ] stream.trot.
- [ ] stream.wag-walk.
- [ ] wait.sit-look.
- [ ] wait.paw-tap.
- [ ] wait.yawn-lie.
- [ ] success.happy-hop.
- [ ] success.spin.
- [ ] error.sad-sit.
- [ ] error.ears-down.
- [ ] rate.empty-bowl.
- [ ] Chốt `belly-2/events.txt`.

## 3.6 `context.txt`

- [ ] poop-slim `belly-2 -> belly-1`.
- [ ] squat/readability.
- [ ] poop tiny/comedic.
- [ ] return/trot.
- [ ] wake/stretch/reset.
- [ ] Chốt `belly-2/context.txt`.

## 3.7 `eat.txt`

- [ ] IDLE.
- [ ] BLINK.
- [ ] EYES OPEN.
- [ ] FOOD APPEARS.
- [ ] FOOD CLOSER.
- [ ] EAT NOM.
- [ ] CHEW.
- [ ] CHEW 2.
- [ ] GULP.
- [ ] BELLY GROW TRANSITION.
- [ ] Transition `belly-2 -> belly-max`.
- [ ] Chốt `belly-2/eat.txt`.

## 3.8 `motion-rest.txt`

- [ ] walk.
- [ ] trot.
- [ ] run.
- [ ] turn.
- [ ] explore.
- [ ] lie-down.
- [ ] sleep breathing.
- [ ] sleep ear twitch.
- [ ] Belly bounce nếu cần nhưng không méo body.
- [ ] Chốt `belly-2/motion-rest.txt`.

---

# 4. `animations/belly-max/`

## 4.1 `_BASE.txt`

- [x] Canonical belly-max silhouette.
- [x] Head anchor.
- [x] Maximum body width hợp lý.
- [x] Belly curve/readability.
- [x] Legs vẫn nhìn rõ bên dưới.
- [x] Tail root không bị body nuốt mất.
- [x] Tail neutral/up/down.
- [x] Blink.
- [x] Ground contact.
- [x] Chốt `belly-max/_BASE.txt`.

## 4.2 `idle.txt`

- [ ] stand-breathe.
- [ ] wander.
- [ ] sit.
- [ ] lick-paw.
- [ ] sniff.
- [ ] scratch.
- [ ] stretch.
- [ ] yawn.
- [ ] Idle chậm/nặng nhưng vẫn sống động.
- [ ] Chốt `belly-max/idle.txt`.

## 4.3 `thinking.txt`

- [ ] scratch-ear.
- [ ] head-tilt.
- [ ] pace.
- [ ] look-up.
- [ ] blink / ear twitch.
- [ ] Gãi tai vẫn đọc được với bụng lớn.
- [ ] Chốt `belly-max/thinking.txt`.

## 4.4 `tools.txt`

- [ ] tail-chase.
- [ ] sniff-search.
- [ ] run.
- [ ] paw-ground.
- [ ] Tail chase không làm mất silhouette bụng.
- [ ] Chốt `belly-max/tools.txt`.

## 4.5 `events.txt`

- [ ] stream.trot.
- [ ] stream.wag-walk.
- [ ] wait.sit-look.
- [ ] wait.paw-tap.
- [ ] wait.yawn-lie.
- [ ] success.happy-hop.
- [ ] success.spin.
- [ ] error.sad-sit.
- [ ] error.ears-down.
- [ ] rate.empty-bowl.
- [ ] Happy hop nhỏ hơn nếu cần.
- [ ] Chốt `belly-max/events.txt`.

## 4.6 `context.txt`

- [ ] poop-slim `belly-max -> belly-2`.
- [ ] look-around trước khi squat nếu dùng.
- [ ] squat.
- [ ] poop.
- [ ] belly shrink transition.
- [ ] kick-ground/trot-away.
- [ ] chain nhiều lần khi context giảm mạnh.
- [ ] wake/stretch/reset.
- [ ] Chốt `belly-max/context.txt`.

## 4.7 `eat.txt`

- [ ] IDLE.
- [ ] BLINK.
- [ ] EYES OPEN.
- [ ] HAPPY WAG A.
- [ ] HAPPY WAG B.
- [ ] Stuffed reaction có personality.
- [ ] Không làm body lớn thêm.
- [ ] Chốt `belly-max/eat.txt`.

## 4.8 `motion-rest.txt`

- [ ] walk.
- [ ] trot.
- [ ] run.
- [ ] turn.
- [ ] explore.
- [ ] lie-down.
- [ ] sleep breathing.
- [ ] sleep ear twitch.
- [ ] Run chậm/nặng hơn body state khác.
- [ ] Chốt `belly-max/motion-rest.txt`.

---

# 5. Cross-body consistency

> Chỉ làm sau khi 4 `_BASE.txt` đã chốt.

- [ ] Head/muzzle là cùng một con chó ở cả 4 state.
- [ ] Head anchor không nhảy vô lý khi đổi belly.
- [ ] Tail root cùng logic.
- [ ] Chân tăng khoảng cách hợp lý theo body width.
- [ ] `normal -> belly-1` đọc được như béo lên.
- [ ] `belly-1 -> belly-2` đọc được như béo lên.
- [ ] `belly-2 -> belly-max` đọc được như béo lên.
- [ ] `belly-max -> belly-2` đọc được như gầy đi.
- [ ] `belly-2 -> belly-1` đọc được như gầy đi.
- [ ] `belly-1 -> normal` đọc được như gầy đi.
- [ ] Cùng action giữ cùng personality ở cả 4 body state.
- [ ] Body càng béo thì gait có thể chậm/nặng hơn nhưng không đổi nghĩa action.

---

# 6. Animation flow / transition review

- [ ] Mỗi action có frame bắt đầu hợp lý.
- [ ] Mỗi action có frame kết thúc có thể nối sang action khác.
- [ ] Không teleport anatomy giữa hai frame.
- [ ] Không có chân tự biến mất ngoài intentional jump.
- [ ] Không có tail root tách body.
- [ ] Không có muzzle/head thay hình vô cớ.
- [ ] Blink trở lại đúng eye pose.
- [ ] Loop không có frame jump bất thường.
- [ ] One-shot event không loop.
- [ ] Random action có thể nối qua neutral pose.
- [ ] Facing direction nhất quán.
- [ ] Resize không làm sprite ra ngoài viewport.
- [ ] Position X do renderer điều khiển.

---

# 7. Behavior system

> Làm sau khi ASCII chính đã tương đối ổn.

- [ ] IDLE weighted random.
- [ ] THINKING weighted random.
- [ ] TOOL weighted random / subtype mapping.
- [ ] WAIT USER behavior pool.
- [ ] Cooldown yawn.
- [ ] Cooldown lick-paw.
- [ ] Cooldown scratch.
- [ ] Cooldown tail-chase.
- [ ] Không random cùng action quá nhiều lần liên tục.
- [ ] SUCCESS interrupt.
- [ ] ERROR interrupt.
- [ ] CONTEXT EAT one-shot theo threshold.
- [ ] COMPACT/RESET poop-slim one-shot.
- [ ] Sleep latch khi energy cạn.
- [ ] Sleeping vẫn breathe/ear twitch/Z.
- [ ] Reset đánh thức chó.
- [ ] Reset energy.
- [ ] Running bình thường không tự làm body gầy.
- [ ] Body state luôn phản ánh context thật.

---

# 8. Wide terminal / movement

- [ ] X offset renderer.
- [ ] `maxX = availableWidth - spriteWidth`.
- [ ] Window nhỏ: local action.
- [ ] Window vừa: short walk.
- [ ] Window rộng: wander/trot.
- [ ] Window rất rộng: run across track.
- [ ] Resize rộng hơn: explore vùng mới.
- [ ] Resize hẹp hơn: clamp position.
- [ ] Turn animation khi đổi hướng.
- [ ] Walk speed theo body state.
- [ ] Run speed theo body state.
- [ ] Không vẽ từng ô màn hình bằng tay.

---

# 9. Sleep / fatigue

- [ ] Energy cost walk.
- [ ] Energy cost run.
- [ ] Energy cost tail-chase.
- [ ] Energy cost happy-hop.
- [ ] Recovery khi sit/lie.
- [ ] active -> slow -> yawn -> lie.
- [ ] transition vào sleep.
- [ ] sleep breathing loop.
- [ ] ear twitch trong sleep.
- [ ] wake animation.
- [ ] Chó không tự tỉnh trước reset nếu dùng sleep latch.
- [ ] Monitor state vẫn hiển thị khi mascot ngủ.

---

# 10. Context / belly lifecycle

- [ ] Chốt threshold `normal`.
- [ ] Chốt threshold `belly-1`.
- [ ] Chốt threshold `belly-2`.
- [ ] Chốt threshold `belly-max`.
- [ ] Context tăng qua threshold -> eat.
- [ ] Context giảm qua threshold -> poop-slim.
- [ ] Compact mạnh có thể giảm nhiều belly level.
- [ ] Reset context từ max về thấp xử lý đúng.
- [ ] Belly max ăn thêm chỉ stuffed reaction.
- [ ] Body state không được lệch số liệu monitor thực tế.

---

# 11. Preview / tooling

- [ ] Runner preview một file bất kỳ.
- [ ] Runner preview một action cụ thể.
- [ ] Runner preview một body state.
- [ ] Loop.
- [ ] `--once`.
- [ ] `--speed`.
- [ ] Print tên frame/state khi review.
- [ ] Không mất leading/trailing spaces.
- [ ] Tính đúng sprite width.
- [ ] ANSI color không làm sai width.
- [ ] Mono mode.
- [ ] Auto/accent color mode nếu dùng màu.

---

# 12. Final review

- [ ] Review toàn bộ NORMAL.
- [ ] Review toàn bộ BELLY +1.
- [ ] Review toàn bộ BELLY +2.
- [ ] Review toàn bộ BELLY MAX.
- [ ] Review tất cả belly transitions.
- [ ] Review monitor-state mapping.
- [ ] Stress test terminal hẹp.
- [ ] Stress test terminal rộng.
- [ ] Stress test ultrawide.
- [ ] Stress test resize liên tục.
- [ ] Stress test tool lâu.
- [ ] Stress test thinking lâu.
- [ ] Stress test idle lâu.
- [ ] Stress test fatigue -> sleep.
- [ ] Stress test sleep -> reset -> wake.
- [ ] Stress test context normal -> max.
- [ ] Stress test context max -> normal.
- [ ] Chốt ASCII v1.
- [ ] Chốt timing v1.
- [ ] Chốt behavior weights v1.
- [ ] Chốt color policy v1.
- [ ] Chốt integration vào monitor.

---

# Recommended review order

1. `normal/_BASE.txt`
2. `belly-1/_BASE.txt`
3. `belly-2/_BASE.txt`
4. `belly-max/_BASE.txt`
5. Idle của 4 body state.
6. Thinking của 4 body state.
7. Walk/run/motion của 4 body state.
8. Tool animations của 4 body state.
9. Wait/success/error/events của 4 body state.
10. Sleep/fatigue của 4 body state.
11. Context poop/reset của 4 body state.
12. Review lại `eat.txt` của 4 body state.
13. Cross-body transitions.
14. Behavior scheduler / random / cooldown.
15. Preview tooling / color.
16. Integration và stress test.

---

# Ghi chú tiến độ

```text
YYYY-MM-DD
- File:
- Action:
- Decision:
- Cần quay lại:

2026-08-26
- File: animations/normal/_BASE.txt
- Action: Final visual review
- Decision: NORMAL BASE visually approved/frozen; no real visual issues found.
- Cần quay lại: No quay lai; belly-1, belly-2, and belly-max bases remain pending.

2026-08-26
- File: animations/belly-1/_BASE.txt
- Action: Final visual review
- Decision: BELLY-1 BASE visually approved/frozen.
- Cần quay lại: No quay lai; belly-2 and belly-max bases remain pending.

2026-08-26
- File: animations/belly-2/_BASE.txt
- Action: Final visual review
- Decision: BELLY-2 BASE visually approved/frozen.
- Cần quay lại: No quay lai; belly-max base remains pending.

2026-08-26
- File: animations/belly-max/_BASE.txt
- Action: Final visual review
- Decision: BELLY-MAX BASE visually approved/frozen.
- Cần quay lại: No quay lai; all four canonical base bodies are approved.
```
