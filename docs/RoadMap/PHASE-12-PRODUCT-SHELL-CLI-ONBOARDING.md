# Phase 12 — Product Shell, CLI Router, First-run Onboarding & Configuration UX

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline.  
> **Quyết định bổ sung:** Phase 12 được tách riêng khỏi Release Candidate để Product Shell / onboarding không bị nhét vào phase hardening cuối cùng.

## Trạng thái

```text
NOT STARTED
```

## Vì sao Phase 12 tồn tại

Các phase trước đã xây từng phần riêng lẻ:

- Live Monitor (`codexm`) và config foundation;
- Session Manager (`codexm --manager`);
- theme/preset/schema;
- configure/reset/config-path foundation;
- doctor/diagnostics foundation;
- Manager view modes `Operations / Table / Charts / Auto`.

Nhưng v1 vẫn cần một phase đứng ra sở hữu **trải nghiệm sản phẩm ở lớp ngoài cùng**: user chạy lệnh gì, lần đầu nhìn thấy gì, config nào được lưu, CLI override thắng config như thế nào, khi nào được hỏi, khi nào tuyệt đối không được hỏi, và làm sao đổi lại lựa chọn sau này.

Phase 12 khóa toàn bộ contract này trước khi Phase 13 làm Release Candidate.

---

## 1. Mục tiêu

Biến các feature đã có thành một product shell thống nhất:

```text
codexm
├── Live Monitor + official Codex passthrough
├── Session Manager
├── Configure / Reset / Config inspection
├── Diagnostics / repair-oriented local tools
└── First-run setup + persisted user preferences
```

User mới phải có đường vào rõ ràng; user cũ không bị hỏi lại vô lý; scripting/non-interactive không bao giờ bị wizard chặn.

---

## 2. Product laws của Phase 12

1. First-run/onboarding luôn xảy ra **trước khi official Codex được spawn**.
2. Sau khi Codex đã spawn, official Codex tiếp tục sở hữu 100% stdin; onboarding/config không được tạo hotkey Live mới.
3. `codexm --manager` không spawn Codex.
4. `codexm --configure`, `--reset`, `--config`, `--config-path`, `--doctor` và các control action khác không spawn Codex trừ khi command đó được spec nói rõ.
5. Unknown Codex arguments vẫn được forward; Monitor không được âm thầm chiếm option của Codex.
6. `--` vẫn là passthrough escape hatch tuyệt đối.
7. Không public Monitor-owned `--history` trong v1.
8. Config/reset của Monitor không được sửa/xóa official Codex auth hoặc `~/.codex/sessions`.
9. Không prompt trong non-interactive/piped environment.
10. Không tự ghi preference chỉ vì user đang browse thử một view; persisted changes phải có intent rõ.

---

## 3. CLI router chính thức

### 3.1 Live / Codex passthrough

Các ví dụ phải tiếp tục hợp lệ:

```powershell
codexm
codexm resume
codexm resume --last
codexm resume <thread-id>
codexm -m <model>
codexm --preset compact resume
codexm --theme matrix resume
codexm -- --help
```

Rules:

- Monitor-owned options được consume bởi Monitor;
- unknown args được forward nguyên thứ tự cho official Codex;
- mọi thứ sau `--` được pass through nguyên vẹn;
- action flag xung đột phải fail rõ ràng thay vì chọn ngẫu nhiên;
- parser phải có regression test chống collision với Codex args.

### 3.2 Product/control actions

Phase 12 phải chuẩn hóa UX/routing/help cho ít nhất:

```text
codexm --manager
codexm --configure
codexm --reset
codexm --config
codexm --config-path
codexm --doctor
codexm --monitor-version
```

Các surface release-oriented sau phải được **reserve/finalize contract** ở đây nhưng phần implementation packaging/network có thể hoàn tất ở Phase 13:

```text
--diagnostics
--repair
--update
--uninstall
--version alias nếu được duyệt
```

Không được để Phase 13 phải tự phát minh lại CLI hierarchy.

### 3.3 Manager one-shot override

Canonical target:

```powershell
codexm --manager
codexm --manager-view operations --manager
codexm --manager-view table --manager
codexm --manager-view charts --manager
codexm --manager-view auto --manager
```

`--manager-view` là Monitor-owned để tránh cướp một generic `--view` có thể thuộc Codex trong tương lai.

Trong Manager, `V` vẫn cho đổi view runtime. Việc đổi runtime **không mặc định ghi config**. Muốn đổi default persisted thì dùng Configure hoặc explicit save action nếu UI sau này cung cấp.

---

## 4. Config precedence

Thứ tự ưu tiên phải cố định:

```text
1. explicit CLI one-shot override
2. persisted Monitor config
3. product defaults
4. terminal capability fallback chỉ ảnh hưởng representation, không đổi preference đã lưu
```

Ví dụ:

- config lưu `theme=color`, chạy `--theme matrix` => run đó dùng Matrix, config vẫn Color;
- config lưu Manager `operations`, chạy `--manager-view charts --manager` => run đó mở Charts, default vẫn Operations;
- terminal không support color => representation hạ xuống phù hợp nhưng preference `color` không bị overwrite thành `mono`.

---

## 5. First-run detection

Wizard chạy khi:

```text
interactive terminal
AND
không có Monitor config hợp lệ / setup chưa hoàn tất
AND
command hiện tại cần product runtime hoặc user gọi --configure/--reset
```

### Không được trigger wizard cho

```text
--help
--monitor-version / --version
--config-path
--config (nếu có thể in effective defaults an toàn)
--doctor khi doctor cần chạy trong môi trường automation
non-interactive stdin/stdout
```

Exact allow/deny list phải được test.

### Existing user migration

User đã có config hợp lệ từ version/schema cũ:

- migrate schema;
- giữ lựa chọn có nghĩa tương đương;
- điền field mới bằng default hợp lý;
- đánh dấu setup complete;
- **không ép chạy onboarding lại chỉ vì app được nâng version**.

Nếu config hỏng/malformed:

- không overwrite im lặng;
- báo lỗi sanitized;
- dùng safe defaults cho run nếu có thể;
- đưa đường `--configure` / `--repair` rõ ràng;
- chỉ ghi file mới khi user xác nhận.

---

## 6. First-run wizard UX

Wizard là full-screen/interactive setup nhỏ, responsive và restore terminal sạch.

Flow chuẩn:

```text
WELCOME
  ↓
Language
  ↓
Live preset
  ↓
Custom Live options (chỉ khi chọn Custom)
  ↓
Theme + background
  ↓
Manager default view
  ↓
Preview / summary
  ↓
Save / Back / Cancel
```

### 6.1 Welcome

Ví dụ:

```text
CODEX MONITOR // INITIAL SETUP

Configure once, change anytime with:
  codexm --configure

Enter continue    Esc cancel
```

Không cần bắt user đọc một tutorial dài.

### 6.2 Language

```text
Language
> Vietnamese
  English
```

Lựa chọn phải ảnh hưởng wizard text và config sau save.

### 6.3 Live preset

```text
Live Monitor
> Recommended
  Compact
  Full
  Custom
```

Preset dùng đúng normalized state/config semantics đã có; không tạo một renderer khác.

### 6.4 Custom flow

Nếu user chọn `Custom`, wizard cho cấu hình các nhóm đã được product hỗ trợ, không lộ implementation internals/collector knobs.

Tối thiểu:

```text
Sections
[x] Context
[x] Usage
[x] Session
[x] Activity
[ ] System

Display modes
System     off | auto | on
Beast      off | auto | on

Header
[x] Activity
[x] Model
[x] Project
[ ] Reasoning
[ ] Git
[ ] Auth
[ ] Health
[ ] Session age

Field visibility
Context / Usage / Session / Activity / System fields
```

Rules:

- user chọn **cái gì muốn thấy**, không chọn số cột/width;
- responsive engine tự quyết layout;
- invalid combination phải normalize rõ ràng;
- preview dùng renderer thật / normalized demo state, không vẽ mock riêng lệch production;
- no Live tabs/navigation config vì Live vẫn passive.

### 6.5 Theme + background

Theme:

```text
Color
Matrix
Mono
```

Background:

```text
Terminal
Black
Dark
```

Rules:

- `color` là semantic cyberpunk palette mặc định;
- `matrix` green-oriented;
- `mono` không phụ thuộc màu;
- terminal capability fallback không thay đổi saved preference;
- background chỉ áp Monitor rows/surface theo spec và reset sạch.

### 6.6 Manager default view

```text
Manager default
> Operations
  Table
  Charts
  Auto
```

Semantics đã chốt:

- **Operations** — balanced operations console, ít box lớn;
- **Table** — power-user session index, box-light;
- **Charts** — visual control room, box-heavy nhưng bounded chart count;
- **Auto** — narrow -> Table, normal/wide -> Operations, ultrawide -> richer Charts/control-room khi hợp lý.

Manager theme dùng global theme trừ khi một quyết định tương lai thêm override riêng.

### 6.7 Preview / summary trước Save

Ví dụ:

```text
READY TO SAVE

Language       Vietnamese
Live preset    Custom
Theme          Color
Background     Terminal
Manager        Operations
System         Auto
Beast          Auto

[P] Preview Live
[M] Preview Manager
Enter Save
Back edit
Esc Cancel
```

Preview không được spawn Codex và không đọc/deep-parse session store vô lý.

### 6.8 Save / cancel

- Save chỉ sau explicit confirmation;
- cancel không được ghi partial config;
- write phải atomic hoặc tương đương an toàn;
- nếu save fail, giữ config cũ và báo lỗi rõ;
- terminal luôn restore cursor/raw/alternate-screen.

---

## 7. Persisted config schema target

Phase 12 phải mở rộng/migrate schema theo hướng tối thiểu:

```json
{
  "configVersion": 3,
  "setupComplete": true,
  "language": "vi",
  "preset": "recommended",
  "theme": "color",
  "background": "terminal",
  "systemMode": "auto",
  "beastMode": "auto",
  "sections": {},
  "metrics": {},
  "fields": {},
  "header": [],
  "manager": {
    "view": "operations"
  },
  "updateCheck": true
}
```

Version số cụ thể có thể thay đổi nếu schema đã advance trước Phase 12, nhưng các semantic field trên phải có owner rõ.

Không lưu:

- Codex API key;
- Codex login token;
- transcript content;
- thread/session secret;
- machine telemetry history.

---

## 8. Configure UX sau first-run

```powershell
codexm --configure
```

Phải mở lại cùng config state machine/wizard với giá trị hiện tại preselected.

User có thể:

- đổi language;
- đổi preset;
- vào/ra Custom;
- đổi sections/metrics/fields/header;
- đổi System/Beast mode;
- đổi theme/background;
- đổi Manager default view;
- preview;
- save hoặc cancel.

`--configure` không spawn Codex.

---

## 9. Reset semantics

```powershell
codexm --reset
```

Reset chỉ phạm vi Codex Monitor.

Tuyệt đối không đụng:

```text
official Codex auth
~/.codex/sessions
Codex settings không thuộc Monitor
project files
Git state
```

Interactive reset:

```text
Reset Codex Monitor preferences?
This does NOT remove Codex login/auth or sessions.

Confirm / Cancel
```

Sau confirm:

- reset Monitor config về clean state;
- chạy onboarding lại nếu interactive;
- non-interactive behavior phải explicit/tested, không treo chờ input.

---

## 10. Help / discoverability

`codexm --help` phải phân nhóm rõ thay vì dump flag phẳng:

```text
LIVE / CODEX
  codexm [monitor options] [codex args]

SESSION MANAGER
  --manager
  --manager-view ...

CUSTOMIZE
  --configure
  --reset
  --preset
  --theme
  --background
  --lang

DIAGNOSTICS
  --doctor
  --config
  --config-path
  ...

PASSTHROUGH
  --
```

Help phải nói rõ:

- Live Monitor passive sau spawn;
- unknown args forward;
- `--` passthrough;
- `--history` không phải Monitor feature;
- Manager độc lập và interactive.

---

## 11. Manager onboarding/persistence contract

Quyết định đã chốt ở Phase 09 được giữ:

```text
Operations / Table / Charts / Auto
```

Phase 12 chịu trách nhiệm phần còn thiếu:

- lưu default view;
- load default khi `codexm --manager`;
- CLI one-shot override;
- Configure thay default;
- first-run chọn default;
- migration cho user cũ không có field manager.view.

`V` trong Manager là runtime navigation. Nếu sau này UI có `Set as default`, action đó phải explicit; không auto-save chỉ vì user cycle qua các view.

---

## 12. Non-interactive / automation contract

Phase 12 phải có test riêng cho:

```text
stdin not TTY
stdout not TTY
CI
pipe/redirection
shell completion/help/version use
```

Rules:

- không alternate-screen wizard;
- không chờ keypress;
- dùng effective defaults/config;
- action không thể hoàn thành non-interactive phải exit với message/code rõ;
- không spawn Codex ngoài ý muốn.

---

## 13. Error handling / recovery

Phải có UX rõ cho:

- config missing;
- config malformed;
- unsupported future configVersion;
- permission denied khi save;
- terminal quá nhỏ;
- theme capability fallback;
- Manager view value lạ;
- conflicting action flags;
- invalid CLI override;
- interrupted wizard (`Ctrl+C`, signal, terminal close).

Mọi đường exit phải restore terminal.

---

## 14. Không làm trong Phase 12

- Không thêm Session Analytics mới — Phase 10.
- Không thêm delete/storage semantics mới — Phase 11.
- Không làm packaging/signing/release artifact — Phase 13.
- Không làm updater network implementation hoàn chỉnh — Phase 13.
- Không thêm telemetry upload.
- Không thêm generic GUI.
- Không thêm Live interactive tabs/hotkeys sau Codex spawn.
- Không đổi official Codex auth/session format.

---

## 15. Auto test bắt buộc

Tối thiểu phải gate:

### CLI/router

- every control action routes đúng;
- no-spawn contract cho Manager/config/doctor/control actions;
- unknown Codex args forwarding;
- `--` passthrough exactness;
- conflicting actions fail deterministic;
- monitor override precedence;
- no accidental `--history` capture.

### First-run/wizard

- first-run detection interactive/non-interactive;
- each preset path;
- Custom path;
- back/cancel/save state machine;
- preview path;
- Unicode/cell width;
- narrow/normal/wide rendering;
- terminal cleanup on normal exit/error/signal.

### Config

- schema migration from current version;
- existing valid users do not get forced wizard;
- new manager.view default migration;
- atomic save failure leaves prior config intact;
- malformed config recovery;
- CLI override does not persist;
- theme capability fallback does not mutate preference;
- reset does not touch Codex auth/session fixtures.

### Manager preference

- saved Operations/Table/Charts/Auto opens corresponding view;
- `--manager-view` overrides one run only;
- Configure changes persisted default;
- V runtime cycle does not silently persist.

---

## 16. Manual test bắt buộc

Trên Windows Terminal tối thiểu:

1. clean user state -> first-run wizard;
2. save Recommended + Operations;
3. relaunch `codexm` -> không hỏi lại;
4. relaunch `codexm --manager` -> đúng saved view;
5. `--manager-view charts` -> Charts một lần, next launch trở về saved default;
6. `--configure` -> đổi Custom + Matrix + Manager Table;
7. verify Live preview và Manager preview;
8. save, restart và xác nhận persistence;
9. cancel configure và xác nhận config cũ không đổi;
10. `--reset`, xác nhận Codex login/session vẫn nguyên;
11. old config migration không hiện first-run lại;
12. malformed config recovery;
13. non-interactive command không treo wizard;
14. Ctrl+C giữa wizard restore terminal;
15. small/normal/ultrawide layout readable.

Linux/macOS nếu chưa có máy thật vẫn ghi `UNVERIFIED PLATFORM`, không giả PASS.

---

## 17. Deliverables

Implementation dự kiến tập trung ở các module kiểu:

```text
src/cli/*
src/config/*
src/onboarding/* hoặc equivalent
src/manager preference integration
```

Tên file cụ thể được phép khác nếu architecture hợp lý.

Bàn giao bắt buộc:

```text
docs/qa/phase-12/PHASE-12-RESULT.md
docs/qa/phase-12/AUTO-TEST-REPORT.md
docs/qa/phase-12/MANUAL-TEST-REQUIRED.md
docs/qa/phase-12/KNOWN-ISSUES.md
```

Ngoài ra phải có:

```text
CLI contract/help snapshot
first-run wizard snapshots
config migration matrix
reset safety evidence
Manager default-view persistence evidence
```

---

## 18. Exit gate

Phase 12 chỉ CLOSED khi:

- CLI router contract deterministic;
- unknown Codex args + `--` forwarding PASS;
- onboarding first-run PASS;
- existing-user migration PASS;
- Configure/Reset PASS;
- Manager default view persistence PASS;
- non-interactive no-prompt PASS;
- no-spawn safety PASS;
- Codex auth/session reset safety PASS;
- terminal restore PASS;
- user duyệt onboarding/config UX;
- BLOCKER = 0;
- P0 = 0.

Sau khi Phase 12 CLOSED mới chuyển sang **Phase 13 — Productization, Full QA, Packaging & Release Candidate**.
