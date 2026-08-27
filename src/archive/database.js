import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { monitorDataDir } from '../platform/common.js';
import { ArchiveRepository } from './repository.js';

export const ARCHIVE_DATABASE_FILENAME = 'archive.sqlite3';

export function getArchiveDatabasePath({ dataDir = null, ...pathOptions } = {}) {
  const root = dataDir ? path.resolve(dataDir) : monitorDataDir(pathOptions);
  return path.join(root, ARCHIVE_DATABASE_FILENAME);
}

export function openArchiveDatabase({
  filePath = null,
  dataDir = null,
  env,
  platform,
  homedir,
  fsRef = fs,
  Database = DatabaseSync,
  Repository = ArchiveRepository,
  now = () => Date.now()
} = {}) {
  const resolvedPath = path.resolve(filePath ?? getArchiveDatabasePath({ dataDir, env, platform, homedir }));
  fsRef.mkdirSync(path.dirname(resolvedPath), { recursive: true, mode: 0o700 });

  let db = null;
  try {
    db = new Database(resolvedPath);
    const repository = new Repository(db, { now }).initialize();
    try {
      if (typeof fsRef.existsSync === 'function'
        && typeof fsRef.chmodSync === 'function'
        && fsRef.existsSync(resolvedPath)) {
        fsRef.chmodSync(resolvedPath, 0o600);
      }
    } catch {}

    let closed = false;
    return {
      filePath: resolvedPath,
      db,
      repository,
      close() {
        if (closed) return;
        closed = true;
        db.close();
      }
    };
  } catch (error) {
    try { db?.close(); } catch {}
    throw error;
  }
}
