// ─── Upload ───────────────────────────────────────────────────────────────────

export interface UploadResult {
  fileId: string;
  fileName: string;
  gcsUri: string;
  mimeType: string;
  uploadedAt: string;
}

// ─── UI Analysis ──────────────────────────────────────────────────────────────

export type UiIssueSeverity = 'critical' | 'major' | 'minor' | 'suggestion';
export type UiIssueCategory =
  | 'layout'
  | 'color-contrast'
  | 'typography'
  | 'spacing'
  | 'responsiveness'
  | 'accessibility'
  | 'other';

export interface UiIssue {
  id: string;
  category: UiIssueCategory;
  severity: UiIssueSeverity;
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
  score: number;
  analyzedAt: string;
}

// ─── Performance Analysis ─────────────────────────────────────────────────────

export type PerfIssueSeverity = 'critical' | 'major' | 'minor' | 'suggestion';
export type PerfIssueCategory =
  | 'render'
  | 'network'
  | 'memory'
  | 'layout-shift'
  | 'long-task'
  | 'other';

export interface PerfIssue {
  id: string;
  category: PerfIssueCategory;
  severity: PerfIssueSeverity;
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

// ─── Live Session ─────────────────────────────────────────────────────────────

export type AnalysisMode = 'ui' | 'perf' | 'enhance';
export type SessionMode = 'ui' | 'perf' | 'both' | 'enhance';

export interface LiveSessionConfig {
  sessionId: string;
  mode: SessionMode;
  createdAt: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  isAudio?: boolean;
  attachments?: { gcsUri: string; mimeType: string }[];
  imageUrl?: string;
}

export interface LiveSessionState {
  config: LiveSessionConfig;
  history: ChatMessage[];
}

// ─── Generic API response wrapper ─────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Code Input ──────────────────────────────────────────────────────────────

export type CodeInputMethod = 'paste' | 'file' | 'folder' | 'github';

export interface CodeFile {
  path: string;
  content: string;
  language: string;
}

// ─── Code Analysis ───────────────────────────────────────────────────────────

export interface CodeAnalysisRequest {
  mode: 'ui' | 'perf';
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

// ─── UI Enhancement ──────────────────────────────────────────────────────────

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

// ─── GitHub Clone ────────────────────────────────────────────────────────────

export interface GitHubCloneResult {
  files: CodeFile[];
  repoName: string;
  filesCount: number;
  truncated: boolean;
}
