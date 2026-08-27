# Phase 11 — Manual Test Required

Status: **FINAL VERIFICATION PENDING**

Manual workflow after automated PASS:

1. Run `npm run dev -- --manager`.
2. Confirm Dashboard advertises `M storage`.
3. Press `A/N/I/C/Space` on Dashboard and confirm none opens Storage.
4. Press `M` to open Storage Manager.
5. Move with Up/Down, PageUp/PageDown, Home/End and confirm the cursor/viewport remains stable.
6. Toggle individual ENDED sessions with `Space`; verify LIVE/UNKNOWN show protected and cannot be selected.
7. Test `A`, `N`, and `I` inside Storage only.
8. Select multiple temp/unimportant ENDED sessions and press `C`; cancel with `N`/Esc and confirm no files were removed.
9. Re-open confirmation and verify the summary/count/size before any destructive action.
10. Only after all temp/fake destructive tests PASS, optionally clear one real unimportant ENDED session and confirm the file disappears while unrelated sessions remain.
11. Resize between narrow/normal/ultrawide while Storage is open and while selections exist.
12. Quit from Dashboard/Storage and confirm terminal state is normal.

Color polish is intentionally deferred; Phase 11 closure is based on correctness, safety, responsiveness and terminal restoration.
