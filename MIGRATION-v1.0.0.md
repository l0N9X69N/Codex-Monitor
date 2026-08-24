# Migrating the existing Codex-Monitor repository to v1.0.0

When overlaying this source bundle onto the existing v0.3.7 repository:

1. Remove the old `package-lock.json` before copying/committing v1.0.0, because
   the old lockfile still describes the v0.x root package/bin map.
2. Copy all files from the v1.0.0 source bundle into the repository root.
3. Existing `assets/demo.png` may be kept; v1.0.0 does not require it at runtime.
4. Remove the stray `codex-monitor-publish` repository entry if it is no longer
   intentionally used.
5. Run `npm run check` and `npm test`.
6. On Windows, run `./install.cmd`, then `codexm --doctor` and `codexm --demo`.

Optional development lockfile regeneration:

```powershell
npm install --package-lock-only --ignore-scripts
```

The production installer itself does not require a checked-in lockfile.
