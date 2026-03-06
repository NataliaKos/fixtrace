import { Component, Output, EventEmitter, signal, inject, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MonacoEditorComponent } from '../monaco-editor/monaco-editor.component';
import { ApiService } from '../../services/api.service';
import type { CodeFile, CodeInputMethod } from '../../models/interfaces';

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.scss', '.json', '.md',
]);

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    html: 'html', css: 'css', scss: 'scss', json: 'json', md: 'markdown',
  };
  return map[ext] ?? 'plaintext';
}

@Component({
  selector: 'app-code-input',
  standalone: true,
  imports: [FormsModule, MonacoEditorComponent],
  template: `
    <div class="flex flex-col gap-0">
      <label class="text-xs font-medium tracking-wide text-base-content/40 uppercase mb-3">
        Source code
        <span class="normal-case font-normal text-base-content/30 ml-1">— optional</span>
      </label>

      <!-- Tab buttons -->
      <div class="flex items-center gap-1 bg-base-200 p-1 rounded-t-xl border border-base-300/30 border-b-0 relative overflow-hidden">
        <!-- Glare effect -->
        <div class="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
        <div class="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-8 bg-white/5 blur-xl rounded-full pointer-events-none"></div>

        <button
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5"
          [class]="activeTab() === 'paste'
            ? 'bg-primary text-primary-content'
            : 'text-base-content/50 hover:text-base-content/70'"
          (click)="switchTab('paste')"
        >
          <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
          Paste
        </button>
        <button
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5"
          [class]="activeTab() === 'file'
            ? 'bg-primary text-primary-content'
            : 'text-base-content/50 hover:text-base-content/70'"
          (click)="switchTab('file')"
        >
          <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
          File
        </button>
        <button
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5"
          [class]="activeTab() === 'folder'
            ? 'bg-primary text-primary-content'
            : 'text-base-content/50 hover:text-base-content/70'"
          (click)="switchTab('folder')"
        >
          <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
          Folder
        </button>
        <button
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5"
          [class]="activeTab() === 'github'
            ? 'bg-primary text-primary-content'
            : 'text-base-content/50 hover:text-base-content/70'"
          (click)="switchTab('github')"
        >
          <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          GitHub
        </button>
      </div>

      <!-- Tab content -->
      <div class="border border-base-300/30 rounded-b-xl overflow-hidden bg-base-200">
        @switch (activeTab()) {
          @case ('paste') {
            <app-monaco-editor
              [value]="pasteContent()"
              language="typescript"
              [readOnly]="false"
              height="300px"
              (valueChange)="onPasteChange($event)"
            />
          }

          @case ('file') {
            <div class="flex flex-col gap-3 p-4">
              <div
                class="relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 group border-base-300 hover:border-base-content/30"
                (click)="fileInput.click()"
              >
                <div class="flex flex-col items-center gap-2 text-base-content/40 group-hover:text-base-content/60 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                  <p class="text-sm font-medium">
                    {{ singleFileName() || 'Click to select a code file' }}
                  </p>
                  <p class="text-xs">Accepts .ts, .html, .css, .scss, .json, .js, .jsx, .tsx</p>
                </div>
                <input
                  #fileInput
                  type="file"
                  class="hidden"
                  accept=".ts,.html,.css,.scss,.json,.js,.jsx,.tsx,.md"
                  (change)="onFileUpload($event)"
                />
              </div>
              @if (files().length > 0) {
                <app-monaco-editor
                  [value]="files()[0].content"
                  [language]="files()[0].language"
                  [readOnly]="true"
                  height="300px"
                />
              }
            </div>
          }

          @case ('folder') {
            <div class="flex flex-col gap-3 p-4">
              <div
                class="relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 group border-base-300 hover:border-base-content/30"
                (click)="folderInput.click()"
              >
                <div class="flex flex-col items-center gap-2 text-base-content/40 group-hover:text-base-content/60 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2-2v13a2 2 0 0 0 2 2Z"/></svg>
                  <p class="text-sm font-medium">
                    {{ folderName() || 'Click to select a project folder' }}
                  </p>
                  @if (files().length > 0) {
                    <p class="text-xs text-success/70">{{ files().length }} code files loaded</p>
                  } @else {
                    <p class="text-xs">Select a folder with your Angular project</p>
                  }
                </div>
                <input
                  #folderInput
                  type="file"
                  class="hidden"
                  webkitdirectory
                  directory
                  multiple
                  (change)="onFolderUpload($event)"
                />
              </div>
            </div>
          }

          @case ('github') {
            <div class="flex flex-col gap-3 p-4">
            <div class="flex gap-2">
              <input
                type="text"
                class="input input-bordered flex-1 text-sm bg-base-100 rounded-xl border-base-300/60 placeholder:text-base-content/25"
                placeholder="https://github.com/user/repo"
                [(ngModel)]="githubUrl"
                (keydown.enter)="cloneGitHub()"
              />
              <button
                class="btn btn-sm btn-secondary rounded-lg h-10 min-h-0 px-4 text-sm font-medium"
                [disabled]="loading() || !githubUrl"
                (click)="cloneGitHub()"
              >
                @if (loading()) {
                  <span class="loading loading-spinner loading-xs"></span>
                  Cloning...
                } @else {
                  Clone
                }
              </button>
            </div>
            @if (repoName()) {
              <p class="text-xs text-success/70">
                Loaded {{ files().length }} files from {{ repoName() }}
                @if (truncated()) {
                  <span class="text-warning/70"> (truncated — too many files)</span>
                }
              </p>
            }
          </div>
        }
      }

      <!-- Error -->
      @if (error()) {
        <p class="text-error text-xs flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          {{ error() }}
        </p>
      }

      @if (files().length > 0 && activeTab() !== 'paste') {
        <div class="flex items-center gap-2">
          <button
            class="btn btn-xs btn-ghost text-error/60 hover:text-error"
            (click)="clearFiles()"
          >Clear code</button>
        </div>
      }
    </div>
  `,
})
export class CodeInputComponent {
  @Output() filesChanged = new EventEmitter<CodeFile[]>();
  @Output() inputMethodChanged = new EventEmitter<CodeInputMethod>();

  private readonly api = inject(ApiService);
  private readonly zone = inject(NgZone);

  activeTab = signal<CodeInputMethod>('paste');
  files = signal<CodeFile[]>([]);
  pasteContent = signal('');
  githubUrl = '';
  loading = signal(false);
  error = signal<string | null>(null);
  singleFileName = signal('');
  folderName = signal('');
  repoName = signal('');
  truncated = signal(false);

  switchTab(tab: CodeInputMethod): void {
    this.activeTab.set(tab);
    this.error.set(null);
    this.inputMethodChanged.emit(tab);
  }

  onPasteChange(content: string): void {
    this.pasteContent.set(content);
    if (content.trim()) {
      const files: CodeFile[] = [{ path: 'snippet.ts', content, language: 'typescript' }];
      this.files.set(files);
      this.filesChanged.emit(files);
    } else {
      this.files.set([]);
      this.filesChanged.emit([]);
    }
  }

  onFileUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.singleFileName.set(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const codeFile: CodeFile = {
        path: file.name,
        content,
        language: detectLanguage(file.name),
      };
      this.files.set([codeFile]);
      this.filesChanged.emit([codeFile]);
    };
    reader.onerror = () => {
      this.error.set('Failed to read file');
    };
    reader.readAsText(file);
  }

  onFolderUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const fileList = input.files;
    if (!fileList || fileList.length === 0) return;

    this.loading.set(true);
    this.error.set(null);

    // Extract folder name from first file's path
    const firstPath = (fileList[0] as any).webkitRelativePath ?? fileList[0].name;
    const folderName = firstPath.split('/')[0];
    this.folderName.set(folderName);

    const codeFiles: CodeFile[] = [];
    let processed = 0;
    const total = fileList.length;
    let readQueued = 0;
    console.log(`[FolderUpload] started — ${total} total files in "${folderName}"`);

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const relativePath = (file as any).webkitRelativePath ?? file.name;

      // Skip non-code files and common junk
      const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
      if (!CODE_EXTENSIONS.has(ext)) {
        processed++;
        if (processed === total) this.finishFolderLoad(codeFiles, input);
        continue;
      }

      // Skip node_modules, dist, .git
      if (
        relativePath.includes('node_modules/') ||
        relativePath.includes('dist/') ||
        relativePath.includes('.git/')
      ) {
        processed++;
        if (processed === total) this.finishFolderLoad(codeFiles, input);
        continue;
      }

      // Skip files > 100KB
      if (file.size > 100 * 1024) {
        console.log(`[FolderUpload] skipping large file (${file.size}B): ${relativePath}`);
        processed++;
        if (processed === total) this.finishFolderLoad(codeFiles, input);
        continue;
      }

      readQueued++;
      const reader = new FileReader();
      reader.onload = () => {
        // Remove the top-level folder name from the path
        const parts = relativePath.split('/');
        const cleanPath = parts.slice(1).join('/') || parts[0];

        codeFiles.push({
          path: cleanPath,
          content: reader.result as string,
          language: detectLanguage(file.name),
        });
        processed++;
        console.log(`[FolderUpload] read ${processed}/${total}: ${cleanPath}`);
        if (processed === total) this.zone.run(() => this.finishFolderLoad(codeFiles, input));
      };
      reader.onerror = () => {
        console.warn(`[FolderUpload] FileReader error for: ${relativePath}`);
        processed++;
        if (processed === total) this.zone.run(() => this.finishFolderLoad(codeFiles, input));
      };
      reader.readAsText(file);
    }

    console.log(`[FolderUpload] queued ${readQueued} reads, skipped ${total - readQueued}`);
  }

  private finishFolderLoad(codeFiles: CodeFile[], inputEl?: HTMLInputElement): void {
    console.log(`[FolderUpload] done — ${codeFiles.length} code files loaded`);
    codeFiles.sort((a, b) => a.path.localeCompare(b.path));
    this.files.set(codeFiles);
    this.loading.set(false);
    this.filesChanged.emit(codeFiles);
    // Reset input value so selecting the same folder again triggers the change event
    if (inputEl) inputEl.value = '';
  }

  cloneGitHub(): void {
    if (!this.githubUrl || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);
    this.repoName.set('');

    this.api.cloneGitHubRepo(this.githubUrl).subscribe({
      next: (result) => {
        this.files.set(result.files);
        this.repoName.set(result.repoName);
        this.truncated.set(result.truncated);
        this.loading.set(false);
        this.filesChanged.emit(result.files);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? 'Failed to clone repository');
        this.loading.set(false);
      },
    });
  }

  clearFiles(): void {
    this.files.set([]);
    this.singleFileName.set('');
    this.folderName.set('');
    this.repoName.set('');
    this.truncated.set(false);
    this.filesChanged.emit([]);
  }
}
