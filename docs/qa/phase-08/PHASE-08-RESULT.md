# Phase 08 — Result

## Trạng thái

**IMPLEMENTED — chờ combined automated verification + manual History data acceptance.**

## Đã làm

- `codexm --history` là Monitor action riêng, không spawn official Codex.
- Session discovery/stat metadata-only từ Codex sessions path.
- RAM-only index/cache; không DB/CSV duplicate store.
- Lazy parse chỉ selected session.
- Historical model: Info/Tokens/Turns/Tools/Resources/Errors.
- Historical normalized provenance tách `official-history` khỏi Live current-run.
- Incremental live-tail theo byte offset, partial-line remainder, no duplicate.
- File truncate/rotation reload an toàn.
- Historical Resources chỉ ghi evidence thật từ session event; không scan filesystem hiện tại để bịa quá khứ.
- Missing historical values giữ `--`; không pricing/cost.

## Exit gate còn lại

```powershell
.\scripts\phase6-9-verify.ps1
node .\src\cli\codexm.js --history
```

Manual cần test folder session thật lớn và một session đang grow.
