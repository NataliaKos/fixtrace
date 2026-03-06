/* ── GitHub clone service ── */

import { simpleGit } from "simple-git";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { v4 as uuidv4 } from "uuid";
import type { CodeFile, GitHubCloneResult } from "../models/interfaces.js";

const MAX_FILES = 200;
const MAX_FILE_SIZE = 100 * 1024; // 100 KB per file
const ALLOWED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".scss", ".json", ".md",
]);

/**
 * Clone a public GitHub repo, read its code files, and return them.
 */
export async function cloneAndReadRepo(repoUrl: string): Promise<GitHubCloneResult> {
  // Validate URL format
  const urlPattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/;
  if (!urlPattern.test(repoUrl)) {
    throw new Error(
      "Invalid GitHub URL. Only public repos at https://github.com/user/repo are supported."
    );
  }

  const repoName = repoUrl.split("/").pop()?.replace(".git", "") ?? "repo";
  const tmpDir = path.join(os.tmpdir(), `fixtrace-clone-${uuidv4()}`);

  try {
    // Shallow clone for speed
    const git = simpleGit();
    await git.clone(repoUrl, tmpDir, ["--depth", "1", "--single-branch"]);

    // Walk directory tree and read code files
    const files: CodeFile[] = [];
    await walkDir(tmpDir, tmpDir, files);

    return {
      files: files.slice(0, MAX_FILES),
      repoName,
      filesCount: files.length,
      truncated: files.length > MAX_FILES,
    };
  } finally {
    // Clean up cloned directory
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function walkDir(
  baseDir: string,
  currentDir: string,
  files: CodeFile[],
): Promise<void> {
  if (files.length >= MAX_FILES) return;

  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (files.length >= MAX_FILES) break;
    const fullPath = path.join(currentDir, entry.name);

    // Skip hidden dirs, node_modules, dist, .git
    if (
      entry.name.startsWith(".") ||
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "build" ||
      entry.name === "coverage"
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      await walkDir(baseDir, fullPath, files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;

      const stat = await fs.stat(fullPath);
      if (stat.size > MAX_FILE_SIZE) continue;

      const content = await fs.readFile(fullPath, "utf-8");
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");

      files.push({
        path: relativePath,
        content,
        language: extToLanguage(ext),
      });
    }
  }
}

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".json": "json",
    ".md": "markdown",
  };
  return map[ext] ?? "plaintext";
}
