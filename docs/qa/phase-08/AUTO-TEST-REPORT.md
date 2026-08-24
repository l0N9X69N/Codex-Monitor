# Phase 08 — Auto Test Report

## Trạng thái

**WAITING USER RUN**

```powershell
.\scripts\phase6-9-verify.ps1
```

Coverage:
- 1000+ fake sessions discover/stat without deep parse;
- selected parse only;
- historical normalized provenance;
- partial append + complete append + no duplicate;
- truncate/rotation reload;
- evidence-only historical Resources;
- no DB/SQLite/CSV created;
- `--history` Monitor-owned, `-- --history` forwarded.

Phase 08 chỉ PASS sau auto xanh và manual session-folder/live-tail thật.
