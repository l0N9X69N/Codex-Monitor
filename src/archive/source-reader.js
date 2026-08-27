import fs from 'node:fs/promises';

const DEFAULT_MAX_BYTES = 256 * 1024;

function safeInteger(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export function sourceIdentityFromStat(stat) {
  if (!stat) return null;
  const dev = typeof stat.dev === 'bigint' ? stat.dev.toString() : String(stat.dev ?? '');
  const ino = typeof stat.ino === 'bigint' ? stat.ino.toString() : String(stat.ino ?? '');
  const birthtimeMs = Number.isFinite(Number(stat.birthtimeMs)) ? Math.trunc(Number(stat.birthtimeMs)) : 0;
  return `${dev}:${ino}:${birthtimeMs}`;
}

export async function inspectArchiveSource(filePath) {
  try {
    const handle = await fs.open(filePath, 'r');
    try {
      const stat = await handle.stat({ bigint: false });
      return {
        exists: true,
        filePath,
        fileIdentity: sourceIdentityFromStat(stat),
        size: Number(stat.size),
        mtimeMs: Number(stat.mtimeMs)
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, filePath };
    throw error;
  }
}

function decodeCompleteLines(buffer, baseOffset) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0x0a) continue;
    let end = index;
    if (end > start && buffer[end - 1] === 0x0d) end -= 1;
    lines.push({
      sourceOffset: baseOffset + start,
      nextOffset: baseOffset + index + 1,
      text: buffer.subarray(start, end).toString('utf8')
    });
    start = index + 1;
  }
  return lines;
}

export async function readCommittedJsonlChunk(filePath, {
  committedOffset = 0,
  maxBytes = DEFAULT_MAX_BYTES
} = {}) {
  const offset = safeInteger(committedOffset);
  const limit = Math.max(1, safeInteger(maxBytes, DEFAULT_MAX_BYTES));
  const handle = await fs.open(filePath, 'r');

  try {
    const before = await handle.stat({ bigint: false });
    const observedSize = Number(before.size);
    const fileIdentity = sourceIdentityFromStat(before);

    if (offset > observedSize) {
      return {
        filePath,
        fileIdentity,
        observedFileSize: observedSize,
        observedMtimeMs: Number(before.mtimeMs),
        committedOffset: offset,
        commitCandidateOffset: offset,
        bytesRead: 0,
        pendingPartialBytes: 0,
        lines: [],
        truncated: true,
        highWaterVerified: false
      };
    }

    if (offset === observedSize) {
      return {
        filePath,
        fileIdentity,
        observedFileSize: observedSize,
        observedMtimeMs: Number(before.mtimeMs),
        committedOffset: offset,
        commitCandidateOffset: offset,
        bytesRead: 0,
        pendingPartialBytes: 0,
        lines: [],
        truncated: false,
        highWaterVerified: true
      };
    }

    const bytesToRead = Math.min(limit, observedSize - offset);
    const buffer = Buffer.allocUnsafe(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, offset);
    const chunk = buffer.subarray(0, bytesRead);
    const lastNewline = chunk.lastIndexOf(0x0a);
    const completeLength = lastNewline >= 0 ? lastNewline + 1 : 0;
    const complete = chunk.subarray(0, completeLength);
    const lines = decodeCompleteLines(complete, offset);
    const commitCandidateOffset = offset + completeLength;
    const after = await handle.stat({ bigint: false });
    const latestSize = Number(after.size);

    return {
      filePath,
      fileIdentity,
      observedFileSize: latestSize,
      observedMtimeMs: Number(after.mtimeMs),
      committedOffset: offset,
      commitCandidateOffset,
      bytesRead,
      pendingPartialBytes: bytesRead - completeLength,
      lines,
      truncated: false,
      highWaterVerified: commitCandidateOffset === latestSize
    };
  } finally {
    await handle.close();
  }
}
