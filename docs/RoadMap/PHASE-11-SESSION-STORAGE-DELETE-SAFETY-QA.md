# Phase 11 — Session Storage, Delete Safety & Manager QA

> **Nguồn chuẩn:** `PROJECT-SPEC.md` — Codex Monitor v1 implementation baseline, frozen 2026-08-25.

## Spec liên quan

Sections 16, 21, 27, 36–37, 40 và 42.

## Mục tiêu

Hoàn thiện storage-management trong Session Manager và stress-test toàn bộ Manager trước productization.

## Storage summary

```text
Session count
Total size
Oldest/Newest
Largest sessions
Size by project
Size by age
```

Expensive breakdown chỉ tính khi Storage được mở/requested và phải cache hợp lý.

## Selection semantics

```text
Space  toggle current row
A      select all visible/filtered eligible ENDED sessions
N      select none
I      invert visible selection
D      delete selected
```

LIVE sessions không eligible cho deletion.

Footer luôn hiện:

```text
Selected: <count> sessions · <size>
```

## Delete confirmation

Phải nói rõ underlying Codex session files sẽ bị xóa vĩnh viễn khỏi sessions root. Default Manager là read-only; không auto cleanup/retention/background delete.

## Pre-delete safety

- canonical path phải nằm trong approved Codex sessions root;
- reject path escape;
- revalidate file/session state ngay trước delete;
- LIVE/uncertain-active session không delete;
- symlink/reparse risk xử lý conservative;
- filtered-out/non-selected files không được đụng;
- partial delete errors phải report rõ, không giả success.

## Manager stress QA

- thousands sessions;
- huge JSONL;
- malformed/truncated file;
- external file deletion;
- multiple LIVE tails + search/filter/sort;
- resize normal/ultrawide/narrow;
- detail charts updating;
- quit/crash/signal restore;
- idle CPU/I/O.

## Không làm trong Phase 11

- Không automatic retention.
- Không backup ngầm.
- Không test destructive lần đầu trên real important sessions.

## Auto test bắt buộc

- delete selected only;
- A/N/I semantics;
- LIVE protected;
- filtered-out protected;
- cancel/confirm;
- path escape/symlink cases rejected;
- size/count accuracy;
- delete error handling;
- stress Manager state/layout/tails.

## Manual test hai tầng

1. fake/temp sessions full workflow;
2. chỉ sau tầng 1 PASS, user chọn một ENDED session thật không quan trọng để test deletion.

## Deliverables

`docs/qa/phase-11/` chứa đủ 4 handoff files + destructive temp-session suite.

## Exit gate

0 delete-safety P0, LIVE protection PASS, Manager stress PASS, terminal restore PASS.

## Trạng thái hiện tại

```text
NOT STARTED — old History storage plan superseded by Session Manager semantics
```
