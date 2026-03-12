/* ── Apply unified-diff hunks to original source ── */

/**
 * Attempt to apply unified-diff `hunks` to the `original` source text.
 * Returns the modified file content. If parsing/applying fails, it falls
 * back to returning the hunks text itself (better than nothing).
 */
export function applyHunks(original: string, hunks: string): string {
  try {
    const lines = original.split("\n");
    const patchLines = hunks.split("\n");

    // Collect hunk ranges: @@ -startOld,countOld +startNew,countNew @@
    const hunkRanges: { startIdx: number; oldStart: number; oldCount: number; newLines: string[] }[] = [];
    let i = 0;

    // Skip diff header lines (---, +++)
    while (i < patchLines.length && !patchLines[i]!.startsWith("@@")) {
      i++;
    }

    while (i < patchLines.length) {
      const headerMatch = patchLines[i]!.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!headerMatch) {
        i++;
        continue;
      }

      const oldStart = parseInt(headerMatch[1]!, 10);
      const oldCount = headerMatch[2] !== undefined ? parseInt(headerMatch[2], 10) : 1;
      i++;

      const newLines: string[] = [];
      let oldConsumed = 0;

      while (i < patchLines.length && !patchLines[i]!.startsWith("@@")) {
        const line = patchLines[i]!;
        if (line.startsWith("-")) {
          // Removed line — consume from old
          oldConsumed++;
        } else if (line.startsWith("+")) {
          // Added line
          newLines.push(line.substring(1));
        } else if (line.startsWith(" ") || line === "") {
          // Context line
          newLines.push(line.startsWith(" ") ? line.substring(1) : line);
          oldConsumed++;
        } else if (line.startsWith("\\")) {
          // "\ No newline at end of file" — skip
        } else {
          // Unknown line format — treat as context
          newLines.push(line);
          oldConsumed++;
        }
        i++;
      }

      hunkRanges.push({ startIdx: i, oldStart, oldCount, newLines });
    }

    if (hunkRanges.length === 0) {
      // No parseable hunks — return the hunks as-is as a fallback
      return hunks;
    }

    // Apply hunks in reverse order so line numbers stay valid
    const result = [...lines];
    for (let h = hunkRanges.length - 1; h >= 0; h--) {
      const hunk = hunkRanges[h]!;
      // unified diff lines are 1-indexed
      const start = hunk.oldStart - 1;
      result.splice(start, hunk.oldCount, ...hunk.newLines);
    }

    return result.join("\n");
  } catch (err) {
    console.warn("[diff-apply] Failed to apply hunks, returning raw hunks as modified:", err);
    return hunks;
  }
}
