import { Component, Input } from '@angular/core';
import { MonacoDiffComponent } from '../monaco-diff/monaco-diff.component';
import type { FilePatch, CodeFile } from '../../models/interfaces';

@Component({
  selector: 'app-diff-viewer',
  standalone: true,
  imports: [MonacoDiffComponent],
  template: `
    @if (patches.length === 0) {
      <div class="flex flex-col items-center gap-2 py-6 text-base-content/40">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-success/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <p class="text-sm font-medium text-base-content/50">No changes suggested</p>
        <p class="text-xs">The code looks good as-is.</p>
      </div>
    } @else {
      <div class="flex flex-col gap-3">
        <p class="text-xs text-base-content/40 font-medium uppercase tracking-wider mb-1">
          {{ patches.length }} file{{ patches.length !== 1 ? 's' : '' }} changed
        </p>

        @for (patch of patches; track patch.filePath; let i = $index) {
          <div class="collapse collapse-arrow bg-base-200/50 border border-base-300/60 rounded-xl hover:border-base-300 transition-colors">
            <input type="checkbox" [checked]="i === 0" />
            <div class="collapse-title flex items-center gap-2.5 text-sm py-3 min-h-0 pr-10">
              <span class="badge badge-secondary badge-xs font-semibold">PATCH</span>
              <span class="font-mono text-base-content/80 truncate">{{ patch.filePath }}</span>
            </div>
            <div class="collapse-content">
              <div class="flex flex-col gap-4 pt-1 border-t border-base-300/40 mt-0 pb-1">
                <!-- Rationale -->
                <div class="mt-3">
                  <span class="text-xs font-semibold text-base-content/40 uppercase tracking-wider">Rationale</span>
                  <p class="text-sm text-base-content/70 mt-1 leading-relaxed">{{ patch.rationale }}</p>
                </div>

                <!-- Unified diff text -->
                <div>
                  <span class="text-xs font-semibold text-base-content/40 uppercase tracking-wider">Unified Diff</span>
                  <pre class="bg-base-300/60 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed border border-base-300/40 mt-1 max-h-64 overflow-y-auto">{{ patch.hunks }}</pre>
                </div>

                <!-- Visual diff -->
                <div>
                  <span class="text-xs font-semibold text-base-content/40 uppercase tracking-wider">Visual Diff</span>
                  <div class="mt-1">
                    <app-monaco-diff
                      [original]="getOriginalContent(patch.filePath)"
                      [modified]="patch.modified"
                      [language]="getLanguage(patch.filePath)"
                      [filePath]="patch.filePath"
                      height="350px"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class DiffViewerComponent {
  @Input({ required: true }) patches: FilePatch[] = [];
  @Input({ required: true }) originalFiles: CodeFile[] = [];

  getOriginalContent(filePath: string): string {
    return this.originalFiles.find((f) => f.path === filePath)?.content ?? '';
  }

  getLanguage(filePath: string): string {
    return this.originalFiles.find((f) => f.path === filePath)?.language ?? 'plaintext';
  }
}
