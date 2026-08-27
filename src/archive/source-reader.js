import fs from 'node:fs/promises';

export const DEFAULT_ARCHIVE_CHUNK_BYTES = 256 * 1024;
export const DEFAULT_ARCHIVE_RECORD_BYTES = 4 * 1024 * 1024;
export const DEFAULT_ARCHIVE_OVERSIZE_SCAN_BYTES = 4 * 1024 * 1024;

const READ_BLOCK_BYTES = 256 * 1024;

function safeInteger(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
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

async function readBlock(handle, position, length) {
  if (length <= 0) return Buffer.alloc(0);
  const buffer = Buffer.allocUnsafe(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

function oversizedMarker(sourceOffset, nextOffset, { completeRecord, byteLength }) {
  return {
    sourceOffset,
    nextOffset,
    text: null,
    oversized: true,
    oversizedCompleteRecord: completeRecord,
    byteLength
  };
}

async function readRecordBeyondSoftLimit(handle, {
  offset,
  observedSize,
  initialChunk,
  softLimit,
  recordLimit,
  oversizeScanLimit
}) {
  const retained = [initialChunk];
  let retainedBytes = initialChunk.length;
  let bytesRead = initialChunk.length;
  let cursor = offset + initialChunk.length;

  while (cursor < observedSize && retainedBytes < recordLimit) {
    const request = Math.min(READ_BLOCK_BYTES, recordLimit - retainedBytes, observedSize - cursor);
    const block = await readBlock(handle, cursor, request);
    if (!block.length) break;
    bytesRead += block.length;
    const newline = block.indexOf(0x0a);
    if (newline >= 0) {
      retained.push(block.subarray(0, newline + 1));
      const complete = Buffer.concat(retained, retainedBytes + newline + 1);
      return {
        bytesRead,
        commitCandidateOffset: offset + complete.length,
        pendingPartialBytes: Math.max(0, bytesRead - complete.length),
        lines: decodeCompleteLines(complete, offset),
        expandedRecord: complete.length > softLimit,
        oversizedLineCount: 0,
        recordTooLarge: false,
        oversizeContinuation: false
      };
    }
    retained.push(block);
    retainedBytes += block.length;
    cursor += block.length;
  }

  if (cursor >= observedSize) {
    return {
      bytesRead,
      commitCandidateOffset: offset,
      pendingPartialBytes: bytesRead,
      lines: [],
      expandedRecord: bytesRead > softLimit,
      oversizedLineCount: 0,
      recordTooLarge: false,
      oversizeContinuation: false
    };
  }

  const maximumScanBytes = Math.max(recordLimit, oversizeScanLimit);
  while (cursor < observedSize && bytesRead < maximumScanBytes) {
    const request = Math.min(READ_BLOCK_BYTES, maximumScanBytes - bytesRead, observedSize - cursor);
    const block = await readBlock(handle, cursor, request);
    if (!block.length) break;
    bytesRead += block.length;
    const newline = block.indexOf(0x0a);
    if (newline >= 0) {
      const nextOffset = cursor + newline + 1;
      return {
        bytesRead,
        commitCandidateOffset: nextOffset,
        pendingPartialBytes: Math.max(0, bytesRead - (nextOffset - offset)),
        lines: [oversizedMarker(offset, nextOffset, { completeRecord: true, byteLength: nextOffset - offset })],
        expandedRecord: true,
        oversizedLineCount: 1,
        recordTooLarge: false,
        oversizeContinuation: false
      };
    }
    cursor += block.length;
  }

  if (bytesRead > 0) {
    const nextOffset = Math.min(observedSize, offset + bytesRead);
    return {
      bytesRead,
      commitCandidateOffset: nextOffset,
      pendingPartialBytes: 0,
      lines: [oversizedMarker(offset, nextOffset, { completeRecord: false, byteLength: nextOffset - offset })],
      expandedRecord: true,
      oversizedLineCount: 1,
      recordTooLarge: true,
      oversizeContinuation: nextOffset < observedSize
    };
  }

  return {
    bytesRead: 0,
    commitCandidateOffset: offset,
    pendingPartialBytes: 0,
    lines: [],
    expandedRecord: true,
    oversizedLineCount: 0,
    recordTooLarge: true,
    oversizeContinuation: false
  };
}

export async function readCommittedJsonlChunk(filePath, {
  committedOffset = 0,
  maxBytes = DEFAULT_ARCHIVE_CHUNK_BYTES,
  maxRecordBytes = DEFAULT_ARCHIVE_RECORD_BYTES,
  maxOversizeScanBytes = DEFAULT_ARCHIVE_OVERSIZE_SCAN_BYTES
} = {}) {
  const offset = safeInteger(committedOffset);
  const limit = positiveInteger(maxBytes, DEFAULT_ARCHIVE_CHUNK_BYTES);
  const recordLimit = Math.max(limit, positiveInteger(maxRecordBytes, DEFAULT_ARCHIVE_RECORD_BYTES));
  const oversizeScanLimit = Math.max(recordLimit, positiveInteger(maxOversizeScanBytes, DEFAULT_ARCHIVE_OVERSIZE_SCAN_BYTES));
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
        highWaterVerified: false,
        expandedRecord: false,
        oversizedLineCount: 0,
        recordTooLarge: false,
        oversizeContinuation: false
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
        highWaterVerified: true,
        expandedRecord: false,
        oversizedLineCount: 0,
        recordTooLarge: false,
        oversizeContinuation: false
      };
    }

    const bytesToRead = Math.min(limit, recordLimit, observedSize - offset);
    const chunk = await readBlock(handle, offset, bytesToRead);
    const lastNewline = chunk.lastIndexOf(0x0a);
    let result;

    if (lastNewline >= 0) {
      const completeLength = lastNewline + 1;
      const complete = chunk.subarray(0, completeLength);
      result = {
        bytesRead: chunk.length,
        commitCandidateOffset: offset + completeLength,
        pendingPartialBytes: chunk.length - completeLength,
        lines: decodeCompleteLines(complete, offset),
        expandedRecord: false,
        oversizedLineCount: 0,
        recordTooLarge: false,
        oversizeContinuation: false
      };
    } else {
      result = await readRecordBeyondSoftLimit(handle, {
        offset,
        observedSize,
        initialChunk: chunk,
        softLimit: limit,
        recordLimit,
        oversizeScanLimit
      });
    }

    const after = await handle.stat({ bigint: false });
    const latestSize = Number(after.size);
    return {
      filePath,
      fileIdentity,
      observedFileSize: latestSize,
      observedMtimeMs: Number(after.mtimeMs),
      committedOffset: offset,
      commitCandidateOffset: result.commitCandidateOffset,
      bytesRead: result.bytesRead,
      pendingPartialBytes: result.pendingPartialBytes,
      lines: result.lines,
      truncated: false,
      highWaterVerified: result.commitCandidateOffset === latestSize,
      expandedRecord: result.expandedRecord,
      oversizedLineCount: result.oversizedLineCount,
      recordTooLarge: result.recordTooLarge,
      oversizeContinuation: result.oversizeContinuation
    };
  } finally {
    await handle.close();
  }
}
