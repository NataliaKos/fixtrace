/* ── FixTrace shared interfaces ── */

// ─── Upload ───────────────────────────────────────────────────────────
export interface UploadResult {
  fileId: string;
  fileName: string;
  gcsUri: string;
  mimeType: string;
  uploadedAt: string;
}

// ─── UI Analysis ──────────────────────────────────────────────────────
export interface UiAnalysisRequest {
  fileId: string;
  gcsUri: string;
  mimeType: string;
  userPrompt?: string;
}

export interface UiIssue {
  id: string;
  category: "layout" | "color-contrast" | "typography" | "spacing" | "responsiveness" | "accessibility" | "other";
  severity: "critical" | "major" | "minor" | "suggestion";
  description: string;
  location: string;
  suggestion: string;
  codeSnippet?: string;
}

export interface UiAnalysisResult {
  requestId: string;
  fileId: string;
  issues: UiIssue[];
  summary: string;
  score: number; // 0-100
  analyzedAt: string;
}

// ─── Performance Analysis ─────────────────────────────────────────────
export interface PerfAnalysisRequest {
  fileId: string;
  gcsUri: string;
  mimeType: string;
  userPrompt?: string;
}

export interface PerfIssue {
  id: string;
  category: "render" | "network" | "memory" | "layout-shift" | "long-task" | "other";
  severity: "critical" | "major" | "minor" | "suggestion";
  description: string;
  metric?: string;
  value?: string;
  suggestion: string;
  codeSnippet?: string;
}

export interface PerfAnalysisResult {
  requestId: string;
  fileId: string;
  issues: PerfIssue[];
  summary: string;
  analyzedAt: string;
}

// ─── Live Session ─────────────────────────────────────────────────────
export interface LiveSessionConfig {
  sessionId: string;
  mode: "ui" | "perf" | "both" | "enhance";
  createdAt: string;
}

export interface LiveSessionMessage {
  role: "user" | "model";
  content: string;
  timestamp: string;
  isAudio?: boolean;
  attachments?: { gcsUri: string; mimeType: string }[];
  audioData?: { base64: string; mimeType: string };
  imageUrl?: string;
}

export interface LiveSessionState {
  config: LiveSessionConfig;
  history: LiveSessionMessage[];
}

// ─── Generic API response wrapper ─────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Code Input ──────────────────────────────────────────────────────────
export interface CodeFile {
  path: string;
  content: string;
  language: string;
}

// ─── Code Analysis ───────────────────────────────────────────────────────
export interface CodeAnalysisRequest {
  mode: "ui" | "perf";
  files: CodeFile[];
  userPrompt?: string;
  fileId?: string;
  gcsUri?: string;
  mimeType?: string;
}

export interface FilePatch {
  filePath: string;
  hunks: string;
  modified: string;
  rationale: string;
}

export interface CodeAnalysisResult {
  requestId: string;
  patches: FilePatch[];
  summary: string;
  score?: number;
  issues: (UiIssue | PerfIssue)[];
  analyzedAt: string;
}

// ─── UI Enhancement ──────────────────────────────────────────────────────
export interface UiEnhanceRequest {
  fileId?: string;
  gcsUri?: string;
  mimeType?: string;
  userPrompt: string;
  files?: CodeFile[];
}

export interface UiEnhanceResult {
  requestId: string;
  imageUrl: string;
  patches: FilePatch[];
  summary: string;
  analyzedAt: string;
}

// ─── GitHub Clone ────────────────────────────────────────────────────────
export interface GitHubCloneRequest {
  repoUrl: string;
}

export interface GitHubCloneResult {
  files: CodeFile[];
  repoName: string;
  filesCount: number;
  truncated: boolean;
}
