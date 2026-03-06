import { Injectable, signal, computed, inject } from '@angular/core';
import { ApiService } from '../services/api.service';
import type {
  UiAnalysisResult,
  PerfAnalysisResult,
  UploadResult,
  CodeFile,
  CodeInputMethod,
  CodeAnalysisRequest,
  CodeAnalysisResult,
  UiEnhanceRequest,
  UiEnhanceResult,
  AnalysisMode,
  SessionMode,
} from '../models/interfaces';

type AnalysisResult = UiAnalysisResult | PerfAnalysisResult | UiEnhanceResult;

interface CachedModeResult {
  result: AnalysisResult | null;
  codeResult: CodeAnalysisResult | null;
  enhanceResult: UiEnhanceResult | null;
  uiResult: UiAnalysisResult | null;
  uploadedFile: UploadResult | null;
  codeFiles: CodeFile[];
  userPrompt: string;
}

@Injectable({ providedIn: 'root' })
export class AnalyzerStateService {
  private readonly api = inject(ApiService);

  readonly mode = signal<AnalysisMode>('ui');
  readonly uploadedFile = signal<UploadResult | null>(null);
  readonly userPrompt = signal<string>('');
  readonly analyzing = signal(false);
  readonly result = signal<AnalysisResult | null>(null);
  readonly error = signal<string | null>(null);
  readonly uiResult = signal<UiAnalysisResult | null>(null);
  readonly enhanceResult = signal<UiEnhanceResult | null>(null);
  readonly codeFiles = signal<CodeFile[]>([]);
  readonly codeInputMethod = signal<CodeInputMethod | null>(null);
  readonly selectedFilePath = signal<string | null>(null);
  readonly codeResult = signal<CodeAnalysisResult | null>(null);
  readonly transcribing = signal(false);

  readonly cachedResults = signal<Partial<Record<AnalysisMode, CachedModeResult>>>({});

  readonly hasCodeContext = computed(() => this.codeFiles().length > 0);
  readonly hasSidebar = computed(() => {
    const method = this.codeInputMethod();
    return (
      this.codeFiles().length > 1 &&
      (method === 'folder' || method === 'github')
    );
  });

  readonly samplePrompts: Record<AnalysisMode, string[]> = {
    ui: [
      'Find all accessibility issues on the screenshot',
      'Check color contrast and typography for WCAG compliance',
      'Identify layout and spacing issues on small screens',
      'Why is this button not showing up on Safari?',
    ],
    enhance: [
      'Redesign with a modern dark theme and neon accents',
      'Make it cleaner with more whitespace and a card-based layout',
      'Add subtle animations and micro-interactions to improve UX',
      'Convert to a mobile-first responsive layout',
    ],
    perf: [
      'Focus on LCP — this is an Angular SPA with lazy-loaded routes',
      'Find render-blocking resources and suggest fixes',
      'Identify memory leaks and unnecessary re-renders',
      'Optimize bundle size and suggest code splitting points',
    ],
  };

  readonly currentSamplePrompts = computed(() => this.samplePrompts[this.mode()]);

  /** Returns true if there is a completed result cached for the given session mode. */
  hasCachedContext(sessionMode: SessionMode): boolean {
    return !!(this.cachedResults()[sessionMode as AnalysisMode]?.result);
  }

  /**
   * Builds a rich text prompt from cached results for the given session mode,
   * ready to be sent as the first message to the live agent.
   */
  buildContextText(sessionMode: SessionMode): string | null {
    return this.buildTextForMode(sessionMode as AnalysisMode);
  }

  /** Returns the uploaded file attachment for the given session mode (used for file pass-through). */
  getCachedFile(sessionMode: SessionMode): UploadResult | null {
    return this.cachedResults()[sessionMode as AnalysisMode]?.uploadedFile ?? null;
  }

  setMode(m: AnalysisMode): void {
    if (m === this.mode()) return;
    this.mode.set(m);
    this.result.set(null);
    this.uiResult.set(null);
    this.enhanceResult.set(null);
    this.codeResult.set(null);
    this.error.set(null);
  }

  onFileUploaded(file: UploadResult): void {
    this.uploadedFile.set(file);
    this.result.set(null);
    this.uiResult.set(null);
    this.enhanceResult.set(null);
    this.codeResult.set(null);
    this.error.set(null);
  }

  onCodeFilesChanged(files: CodeFile[]): void {
    this.codeFiles.set(files);
    this.codeResult.set(null);
    this.result.set(null);
    this.uiResult.set(null);
    this.enhanceResult.set(null);
    this.error.set(null);
    if (files.length > 0 && !this.selectedFilePath()) {
      this.selectedFilePath.set(files[0].path);
    }
  }

  getSelectedFileContent(): string {
    const path = this.selectedFilePath();
    return this.codeFiles().find((f) => f.path === path)?.content ?? '';
  }

  getSelectedFileLanguage(): string {
    const path = this.selectedFilePath();
    return this.codeFiles().find((f) => f.path === path)?.language ?? 'plaintext';
  }

  transcribeAndAppend(base64: string, mimeType: string): void {
    this.transcribing.set(true);
    this.api.transcribeAudio(base64, mimeType).subscribe({
      next: (text) => {
        const current = this.userPrompt();
        this.userPrompt.set(current ? `${current}\n${text}` : text);
        this.transcribing.set(false);
      },
      error: () => {
        this.error.set('Voice transcription failed. Please try again or type your context.');
        this.transcribing.set(false);
      },
    });
  }

  analyze(): void {
    const file = this.uploadedFile();
    const codeFiles = this.codeFiles();

    if (!file && codeFiles.length === 0 && this.mode() !== 'enhance') return;

    this.analyzing.set(true);
    this.error.set(null);

    if (this.mode() === 'enhance') {
      const request: UiEnhanceRequest = {
        userPrompt: this.userPrompt() || 'Enhance this UI',
        fileId: file?.fileId,
        gcsUri: file?.gcsUri,
        mimeType: file?.mimeType,
        files: codeFiles.length > 0 ? codeFiles : undefined,
      };

      this.api.enhanceUi(request).subscribe({
        next: (res) => {
          this.enhanceResult.set(res);
          this.result.set(res as any);

          if (res.patches && res.patches.length > 0) {
            const currentFiles = [...this.codeFiles()];
            for (const patch of res.patches) {
              const fileIndex = currentFiles.findIndex(f => f.path === patch.filePath);
              if (fileIndex !== -1) {
                currentFiles[fileIndex] = { ...currentFiles[fileIndex], content: patch.modified };
              } else {
                currentFiles.push({
                  path: patch.filePath,
                  content: patch.modified,
                  language: patch.filePath.split('.').pop() || 'plaintext',
                });
              }
            }
            this.codeFiles.set(currentFiles);
          }

          this.saveCacheForCurrentMode();
          this.analyzing.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.error ?? 'Enhancement failed. Please try again.');
          this.analyzing.set(false);
        },
      });
      return;
    }

    if (codeFiles.length > 0) {
      const request: CodeAnalysisRequest = {
        mode: this.mode() === 'perf' ? 'perf' : 'ui',
        files: codeFiles,
        userPrompt: this.userPrompt() || undefined,
        fileId: file?.fileId,
        gcsUri: file?.gcsUri,
        mimeType: file?.mimeType,
      };

      this.api.analyzeCode(request).subscribe({
        next: (res) => {
          this.codeResult.set(res);
          const resultObj: any = {
            requestId: res.requestId,
            fileId: file?.fileId ?? '',
            issues: res.issues,
            summary: res.summary,
            analyzedAt: res.analyzedAt,
          };
          if (this.mode() === 'ui') {
            resultObj.score = res.score ?? 0;
            this.result.set(resultObj as UiAnalysisResult);
            this.uiResult.set(resultObj as UiAnalysisResult);
          } else {
            this.result.set(resultObj as PerfAnalysisResult);
            this.uiResult.set(null);
          }
          this.saveCacheForCurrentMode();
          this.analyzing.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.error ?? 'Analysis failed. Please try again.');
          this.analyzing.set(false);
        },
      });
      return;
    }

    const done = (res: AnalysisResult) => {
      this.result.set(res);
      this.codeResult.set(null);
      if (this.mode() === 'ui') {
        this.uiResult.set(res as UiAnalysisResult);
      } else {
        this.uiResult.set(null);
      }
      this.saveCacheForCurrentMode();
      this.analyzing.set(false);
    };

    const fail = (err: any) => {
      this.error.set(err?.error?.error ?? 'Analysis failed. Please try again.');
      this.analyzing.set(false);
    };

    if (this.mode() === 'ui') {
      this.api.analyzeUi(file!.fileId, file!.gcsUri, file!.mimeType, this.userPrompt() || undefined)
        .subscribe({ next: done, error: fail });
    } else {
      this.api.analyzePerf(file!.fileId, file!.gcsUri, file!.mimeType, this.userPrompt() || undefined)
        .subscribe({ next: done, error: fail });
    }
  }

  private saveCacheForCurrentMode(): void {
    const mode = this.mode();
    this.cachedResults.update(cache => ({
      ...cache,
      [mode]: {
        result: this.result(),
        codeResult: this.codeResult(),
        enhanceResult: this.enhanceResult(),
        uiResult: this.uiResult(),
        uploadedFile: this.uploadedFile(),
        codeFiles: this.codeFiles(),
        userPrompt: this.userPrompt(),
      },
    }));
  }

  private buildTextForMode(mode: AnalysisMode): string | null {
    const cached = this.cachedResults()[mode];
    if (!cached?.result) return null;

    const lines: string[] = [];
    const modeLabel = mode === 'ui' ? 'UI Analysis' : mode === 'perf' ? 'Performance Analysis' : 'UI Enhancement';

    lines.push(`## ${modeLabel} Results`);

    if (cached.userPrompt) {
      lines.push(`\n**My goal:** ${cached.userPrompt}`);
    }

    if (mode === 'enhance') {
      const enhance = cached.enhanceResult;
      lines.push(`\n**Summary:** ${cached.result.summary}`);
      if (enhance?.imageUrl) {
        lines.push(`\nA new UI design image was generated.`);
      }
      if (enhance?.patches?.length) {
        lines.push(`\n**Code changes suggested:** ${enhance.patches.length} file${enhance.patches.length !== 1 ? 's' : ''} modified`);
        for (const p of enhance.patches) {
          lines.push(`  - ${p.filePath}: ${p.rationale}`);
        }
      }
    } else {
      const ui = cached.uiResult;
      if (mode === 'ui' && ui) {
        lines.push(`\n**UI Score:** ${ui.score}/100`);
      }
      lines.push(`\n**Summary:** ${cached.result.summary}`);

      const issues = (cached.result as any).issues as Array<any> | undefined;
      if (issues?.length) {
        lines.push(`\n**Issues found (${issues.length} total):**`);
        for (const issue of issues.slice(0, 8)) {
          lines.push(`- [${issue.severity}] ${issue.category} — ${issue.description}`);
          if (issue.location) lines.push(`  Location: ${issue.location}`);
          if (issue.suggestion) lines.push(`  Fix: ${issue.suggestion}`);
          if (issue.codeSnippet) lines.push(`  \`\`\`\n  ${issue.codeSnippet.trim()}\n  \`\`\``);
        }
        if (issues.length > 8) {
          lines.push(`  ...and ${issues.length - 8} more issue${issues.length - 8 !== 1 ? 's' : ''}.`);
        }
      }

      if (cached.codeResult?.patches?.length) {
        lines.push(`\n**Suggested code changes:** ${cached.codeResult.patches.length} file${cached.codeResult.patches.length !== 1 ? 's' : ''} modified`);
        for (const p of cached.codeResult.patches) {
          lines.push(`  - ${p.filePath}: ${p.rationale}`);
        }
      }
    }

    if (cached.codeFiles.length) {
      const names = cached.codeFiles.map(f => f.path);
      lines.push(`\n**Code analyzed:** ${cached.codeFiles.length} file${cached.codeFiles.length !== 1 ? 's' : ''}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` +${names.length - 5} more` : ''}`);
    }

    lines.push(`\nPlease help me understand and address these findings.`);

    return lines.join('\n');
  }
}
