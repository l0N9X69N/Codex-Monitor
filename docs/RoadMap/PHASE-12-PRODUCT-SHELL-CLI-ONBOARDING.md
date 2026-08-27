# Phase 12 — Product Shell, CLI Router, First-run Onboarding & Configuration UX

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline.  
> **Quyết định bổ sung:** Phase 12 được tách riêng khỏi Release Candidate để Product Shell / onboarding không bị nhét vào phase hardening cuối cùng.  
> **Tích hợp mới:** Phase 12 phải giữ tương thích với `PHASE-11-1-LOCAL-SESSION-ARCHIVE.md`; không tạo một Config engine thứ hai và không làm mất semantics Archive/Hook/SQLite đã khóa ở Phase 11-1.

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
- Manager view modes `Operations / Table / Charts / Auto`;
- Phase 11-1 bổ sung Local Session Archive, Codex hooks, Archive Service, SQLite và màn Config dùng chung trong Manager.

Nhưng v1 vẫn cần một phase đứng ra sở hữu **trải nghiệm sản phẩm ở lớp ngoài cùng**: user chạy lệnh gì, lần đầu nhìn thấy gì, config nào được lưu, CLI override thắng config như thế nào, khi nào được hỏi, khi nào tuyệt đối không được hỏi, và làm sao đổi lại lựa chọn sau này.

Phase 12 khóa toàn bộ contract này trước khi Phase 13 làm Release Candidate.

---

## 1. Mục tiêu

Biến các feature đã có thành một product shell thống nhất:

```text
codexm
├── Live Monitor + official Codex passthrough
├── Session Manager
│   └── C → Config
├── Configure / Reset / Config inspection
├── Local Session Archive controls
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
11. `Manager → C` và `codexm --configure` phải dùng **cùng config schema/controller**, không được diverge thành hai hệ cấu hình.
12. Archive là explicit opt-in. Migrate/config/reset không được vô tình bật background service/hook cho user chưa chọn.
13. Reset hoặc disable Archive không được tự xóa SQLite archive; archive-only analytics có thể không rebuild được nếu raw JSONL đã mất.
14. Hook/Archive side effects chỉ chạy sau explicit save/apply thành công; cancel/revert không để component ở trạng thái nửa bật nửa tắt.

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

Trong Manager, `V` vẫn cho đổi view runtime. Việc đổi runtime **không mặc định ghi config**. Muốn đổi default persisted thì dùng Config hoặc explicit save action.

### 3.4 Config entry points

Canonical:

```text
codexm --manager
→ C
→ Config screen

codexm --configure
→ cùng Config screen/component
```

`C` chỉ thuộc Manager TUI. Live Monitor không thêm `C` hotkey hay bất kỳ Monitor-owned navigation input nào sau Codex spawn.

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

Archive không có one-shot implicit enable chỉ vì Manager mở. Nếu archive disabled trong persisted config thì Manager dùng JSONL fallback và không tự bật service/hook.

---

## 5. First-run detection

Wizard chạy khi:

```text
interactive terminal
AND
không có Monitor config hợp lệ / setup chưa hoàn tất
AND
command hiện tại cần product runtime hoặc user gọi --configure/--reset theo flow được thiết kế
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

Đối với field mới từ Phase 11-1:

```text
archive.enabled = false
```

cho user cũ nếu họ chưa từng explicit opt-in. Migration không được tự cài hook/start service chỉ vì schema mới có Archive.

Nếu config hỏng/malformed:

- không overwrite im lặng;
- báo lỗi sanitized;
- dùng safe defaults cho run nếu có thể;
- đưa đường `--configure` / `--repair` rõ ràng;
- chỉ ghi file mới khi user xác nhận.

---

## 6. First-run wizard UX

Wizard là full-screen/interactive setup nhỏ, responsive và restore terminal sạch.

Flow chuẩn vẫn tối giản:

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

**Không tự bật Local Session Archive trong first-run.** Archive mặc định Disabled để giữ nguyên nguyên tắc “cái gì user không chọn thì không chạy ngầm”. User có thể bật sau qua `Manager → C → Archive` hoặc `codexm --configure → Archive`.

Một future UX decision có thể thêm explicit Archive opt-in step, nhưng chỉ khi wording/consent rõ và không thay đổi default Disabled âm thầm.

### 6.1 Welcome

```text
CODEX MONITOR // INITIAL SETUP

Configure once, change anytime with:
  codexm --configure

Manager also provides:
  C  Config

Enter continue    Esc cancel
```

### 6.2 Language

```text
Language
> Vietnamese
  English
```

### 6.3 Live preset

```text
Live Monitor
> Recommended
  Compact
  Full
  Custom
```

### 6.4 Custom flow

Tối thiểu:

```text
Sections
[x] Context
[x] Usage
[x] Session
[x] Activity
[ ] System

Display modes
System      off | auto | on
Companion   off | auto | always

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

### 6.6 Manager default view

```text
Manager default
> Operations
  Table
  Charts
  Auto
```

### 6.7 Preview / summary trước Save

```text
READY TO SAVE

Language       Vietnamese
Live preset    Custom
Theme          Color
Background     Terminal
Manager        Operations
System         Auto
Companion      Auto
Archive        Disabled

[P] Preview Live
[M] Preview Manager
Enter Save
Back edit
Esc Cancel
```

Preview không được spawn Codex và không deep-parse session store vô lý.

### 6.8 Save / cancel

- Save chỉ sau explicit confirmation;
- cancel không được ghi partial config;
- write phải atomic hoặc tương đương an toàn;
- nếu save fail, giữ config cũ và báo lỗi rõ;
- terminal luôn restore cursor/raw/alternate-screen.

---

## 7. Shared Config screen sau first-run

Phase 11-1 đã khóa hướng UX: Config là **một màn riêng**, không phải session-detail tab.

Canonical tabs:

```text
Live View
Cards
Fields
Header
Companion
Appearance
Archive
Manager
Updates
```

Phase 12 chịu trách nhiệm product-shell integration, persistence, migration, discoverability và polish của component này; không viết một config UI song song.

`codexm --configure` phải mở cùng state/controller với `Manager → C`, chỉ khác host/lifecycle:

```text
                ConfigController
                     │
          ┌──────────┴──────────┐
          │                     │
codexm --configure        Manager → C
```

Manager Config:

```text
Esc → quay lại Manager
```

Standalone Config:

```text
Esc → cancel/exit sạch
```

---

## 8. Archive Config contract

Archive tab/config phải expose ít nhất:

```text
Archive enabled
Retention
Size limit
```

Health/state như Service/Hook/Watcher/SQLite/Sync là runtime status, không được ghi nhầm thành user preference.

Ví dụ preference:

```json
"archive": {
  "enabled": false,
  "retention": "forever",
  "sizeLimitBytes": null
}
```

OFF → ON sau Save phải gọi Phase 11-1 lifecycle contract:

```text
validate compatibility
→ initialize/migrate SQLite
→ install/enable Monitor-owned Codex hook integration
→ start/wake Archive Service
→ reconcile JSONL sources
```

ON → OFF:

```text
stop Archive Service
→ disable/remove Monitor-owned archive hook integration
→ keep SQLite archive by default
```

Nếu side effect fail sau config save, UX phải report degraded/attention state và có đường Repair/Reconcile; không được giả Archive healthy.

---

## 9. Persisted config schema target

Phase 12 phải mở rộng/migrate schema theo hướng tối thiểu:

```json
{
  "configVersion": 4,
  "setupComplete": true,
  "language": "vi",
  "preset": "recommended",
  "theme": "color",
  "background": "terminal",
  "systemMode": "auto",
  "companionMode": "auto",
  "sections": {},
  "metrics": {},
  "fields": {},
  "header": [],
  "manager": {
    "view": "operations"
  },
  "archive": {
    "enabled": false,
    "retention": "forever",
    "sizeLimitBytes": null
  },
  "updateCheck": true
}
```

Version số cụ thể có thể thay đổi nếu schema đã advance trước Phase 12.

Không lưu trong config:

- Codex API key;
- Codex login token;
- transcript content;
- thread/session secret;
- machine telemetry history;
- Archive Service PID như durable preference;
- hook payload;
- SQLite health state.

---

## 10. Configure UX sau first-run

```powershell
codexm --configure
```

Mở **shared tabbed Config screen**, giá trị hiện tại preselected.

User có thể:

- đổi language;
- đổi preset;
- đổi sections/metrics/fields/header;
- đổi System/Companion mode;
- đổi theme/background;
- đổi Manager default view;
- bật/tắt/configure Local Session Archive;
- đổi update preference;
- preview khi phù hợp;
- save/revert/cancel.

`--configure` không spawn Codex.

Live visual config lưu cho run tiếp theo; không bắt buộc IPC hot reload sang một `codexm` đang chạy ở terminal khác.

Archive config có immediate lifecycle side effects **sau Save** vì đây là component local service/hook, không chỉ visual preference.

---

## 11. Reset semantics

```powershell
codexm --reset
```

Reset chỉ phạm vi Codex Monitor preferences.

Tuyệt đối không đụng:

```text
official Codex auth
~/.codex/sessions
Codex settings/hook/plugin không thuộc Monitor
project files
Git state
archived SQLite analytics nếu user chưa explicit chọn Clear Archive
```

Nếu Archive đang enabled và reset đưa config về default Disabled:

```text
stop Monitor Archive Service
remove/disable Monitor-owned archive hook integration
keep SQLite archive file/data
```

Interactive reset phải nói rõ:

```text
Reset Codex Monitor preferences?

This does NOT remove:
- Codex login/auth
- Codex sessions
- Local Session Archive data

Archive background indexing will be disabled.

Confirm / Cancel
```

`Clear Archive` là action riêng trong Archive UI, không gộp vào reset.

---

## 12. Doctor / diagnostics / repair integration

Phase 12 phải reserve/finalize UX contract để Phase 13 harden:

`--doctor` có thể report sanitized local status khi Archive enabled:

```text
Archive config
SQLite open/schema
Archive Service status
Codex Hook integration status
Watcher/reconcile health
Pending/failed ingest count
```

Không dump prompts/tool output/raw transcript.

`--repair` được phép repair **Monitor-owned** archive hook/service/config integration, nhưng:

- không repair/overwrite hook/plugin của app khác;
- không delete archive DB để “fix” nếu chưa có explicit destructive confirmation;
- không modify official Codex binary;
- failure phải giữ Codex usable.

---

## 13. Help / discoverability

`codexm --help` phải phân nhóm rõ:

```text
LIVE / CODEX
  codexm [monitor options] [codex args]

SESSION MANAGER
  --manager
  --manager-view ...
  Inside Manager: C Config

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
- Manager độc lập và interactive;
- Local Session Archive là optional/local-only và mặc định không tự bật cho user chưa opt-in.

---

## 14. Manager onboarding/persistence contract

Quyết định Phase 09 được giữ:

```text
Operations / Table / Charts / Auto
```

Phase 12 chịu trách nhiệm:

- lưu default view;
- load default khi `codexm --manager`;
- CLI one-shot override;
- Config thay default;
- first-run chọn default;
- migration cho user cũ không có field `manager.view`;
- expose `C Config` discoverably ở Manager footer/help.

`V` trong Manager là runtime navigation và không auto-save.

---

## 15. Non-interactive / automation contract

Phải test:

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
- không spawn Codex ngoài ý muốn;
- không bật/tắt Archive Service hoặc install/remove hooks chỉ vì đọc config/doctor output.

---

## 16. Error handling / recovery

Phải có UX rõ cho:

- config missing/malformed;
- unsupported future configVersion;
- permission denied khi save;
- terminal quá nhỏ;
- theme capability fallback;
- Manager view value lạ;
- conflicting action flags;
- invalid CLI override;
- interrupted wizard/config (`Ctrl+C`, signal, terminal close);
- Archive DB unavailable/locked;
- Archive Service start/stop failure;
- Codex hook missing/incompatible;
- config says Archive enabled nhưng runtime degraded;
- partial Apply side effect.

Mọi đường exit phải restore terminal.

Config file và runtime health không được conflated: config có thể `enabled=true` trong khi health là `ATTENTION`; UI phải nói đúng trạng thái thay vì silently flip preference.

---

## 17. Không làm trong Phase 12

- Không thêm Session Analytics mới — Phase 10.
- Không phát minh lại Archive/SQLite ingest/delete semantics — Phase 11-1.
- Không thay đổi destructive raw-session safety — Phase 11.
- Không làm packaging/signing/release artifact — Phase 13.
- Không làm updater network implementation hoàn chỉnh — Phase 13.
- Không thêm telemetry upload.
- Không thêm generic GUI.
- Không thêm Live interactive tabs/hotkeys sau Codex spawn.
- Không đổi official Codex auth/session format.
- Không tạo second Config engine thay cho shared ConfigController từ Phase 11-1.

---

## 18. Auto test bắt buộc

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
- Archive remains Disabled unless explicit opt-in outside default first-run flow;
- back/cancel/save state machine;
- preview path;
- Unicode/cell width;
- narrow/normal/wide rendering;
- terminal cleanup on normal exit/error/signal.

### Shared Config

- Manager `C` và `codexm --configure` dùng cùng schema/controller;
- Manager Esc returns to Manager without losing unrelated state;
- standalone Esc cancels cleanly;
- tabs render responsive;
- Save/Revert semantics;
- visual config does not hot-mutate unrelated running Live terminal;
- Archive OFF→ON invokes lifecycle only after explicit Save;
- Archive ON→OFF stops service/hook and preserves DB;
- failed archive Apply reports ATTENTION/degraded honestly.

### Config migration

- schema migration from current version;
- existing valid users do not get forced wizard;
- new `manager.view` default migration;
- new archive config migration defaults Disabled;
- migration does not install hooks/start service;
- atomic save failure leaves prior config intact;
- malformed config recovery;
- CLI override does not persist;
- theme capability fallback does not mutate preference;
- reset does not touch Codex auth/session/archive fixtures.

### Manager preference

- saved Operations/Table/Charts/Auto opens corresponding view;
- `--manager-view` overrides one run only;
- Config changes persisted default;
- V runtime cycle does not silently persist.

### Archive control safety

- Reset while Archive enabled disables Monitor-owned service/hook but preserves SQLite data;
- `--config` does not expose secrets/raw content;
- `--doctor` Archive health is sanitized;
- `--repair` never removes unrelated Codex hooks/plugins;
- cancel/revert never changes service/hook state.

---

## 19. Manual test bắt buộc

Trên Windows Terminal tối thiểu:

1. clean user state -> first-run wizard;
2. save Recommended + Operations; Archive remains Disabled;
3. relaunch `codexm` -> không hỏi lại;
4. relaunch `codexm --manager` -> đúng saved view;
5. press `C` -> shared Config screen;
6. `--configure` -> verify cùng current settings/tabs;
7. đổi Custom + Matrix + Manager Table;
8. bật Archive từ Config -> Save -> verify hook/service/SQLite/reconcile health;
9. disable Archive -> verify service/hook stopped nhưng SQLite archive còn;
10. verify Live preview và Manager preview;
11. cancel configure và xác nhận config/runtime cũ không đổi;
12. `--reset`, xác nhận Codex login/session/archive DB vẫn nguyên và background Archive disabled;
13. old config migration không hiện first-run lại và không tự bật Archive;
14. malformed config recovery;
15. non-interactive command không treo wizard;
16. Ctrl+C giữa wizard/config restore terminal;
17. small/normal/ultrawide layout readable;
18. Archive runtime degraded -> Config/Doctor show ATTENTION thay vì giả READY.

Linux/macOS nếu chưa có máy thật vẫn ghi `UNVERIFIED PLATFORM`, không giả PASS.

---

## 20. Deliverables

Implementation dự kiến tập trung ở các module kiểu:

```text
src/cli/*
src/config/*
src/onboarding/* hoặc equivalent
src/manager preference integration
shared ConfigController integration
archive config/lifecycle adapter integration
```

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
shared Config screen snapshots
config migration matrix
reset safety evidence
Manager default-view persistence evidence
Archive enable/disable/reset safety evidence
```

---

## 21. Exit gate

Phase 12 chỉ CLOSED khi:

- CLI router contract deterministic;
- unknown Codex args + `--` forwarding PASS;
- onboarding first-run PASS;
- existing-user migration PASS;
- Manager `C` + `codexm --configure` shared Config PASS;
- Configure/Reset PASS;
- Archive config opt-in/default-disabled semantics PASS;
- Archive enable/disable/reset side-effect safety PASS;
- Manager default view persistence PASS;
- non-interactive no-prompt PASS;
- no-spawn safety PASS;
- Codex auth/session/archive-data reset safety PASS;
- terminal restore PASS;
- user duyệt onboarding/config UX;
- BLOCKER = 0;
- P0 = 0.

Sau khi Phase 12 CLOSED mới chuyển sang **Phase 13 — Productization, Full QA, Packaging & Release Candidate**.
