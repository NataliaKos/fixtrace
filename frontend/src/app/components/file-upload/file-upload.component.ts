import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { ApiService } from '../../services/api.service';
import type { UploadResult } from '../../models/interfaces';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  template: `
    <div class="flex justify-center">
      <div
        class="upload-drop-zone relative w-80 rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 group bg-base-200 border border-base-300/60 shadow-sm"
        [class.border-primary]="dragOver()"
        [class.bg-primary/5]="dragOver()"
        (dragover)="onDragOver($event)"
        (dragleave)="dragOver.set(false)"
        (drop)="onDrop($event)"
        (click)="fileInput.click()"
      >
        @if (uploading()) {
          <div class="flex flex-col items-center gap-3">
            <span class="loading loading-spinner loading-md text-primary"></span>
            <span class="text-sm text-base-content/50">Uploading file\u2026</span>
          </div>
        } @else if (uploaded()) {
          <div class="flex flex-col items-center gap-2">
            <div class="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <span class="text-sm font-medium text-success">{{ uploaded()!.fileName }}</span>
            <span class="text-xs text-base-content/40">Click to replace</span>
          </div>
        } @else {
          <div class="flex flex-col items-center gap-3">
            <!-- Cloud sync icon -->
            <div class="mb-1">
              <svg class="w-10 h-10 text-cyan-400/80" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 36c-4.42 0-8-3.58-8-8 0-3.87 2.75-7.1 6.4-7.84C13.48 14.66 18.28 10 24 10c4.66 0 8.68 2.82 10.42 6.84C38.34 17.64 42 21.78 42 26.67 42 31.82 37.97 36 33 36" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M28 26l-4-4-4 4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M24 22v12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- Circular arrows around cloud -->
                <path d="M18 14.5c1.6-2.1 4.2-3.5 7-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
                <path d="M32.5 18c1.2 1.8 1.8 4 1.5 6.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
              </svg>
            </div>
            <div class="text-center">
              <p class="text-sm font-semibold text-base-content/90">Drag & drop a UI screenshot or video</p>
              <p class="text-xs mt-1.5 text-base-content/35">Or browse from device</p>
            </div>
            <button
              type="button"
              class="mt-1 px-5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border border-base-content/15 hover:border-base-content/30 text-base-content/60 hover:text-base-content/90 bg-base-content/5 hover:bg-base-content/10"
              (click)="$event.stopPropagation(); fileInput.click()"
            >
              Upload media
            </button>
          </div>
        }

        <input
          #fileInput
          type="file"
          class="hidden"
          [accept]="accept"
          (change)="onFileSelected($event)"
        />
      </div>
    </div>

    @if (errorMsg()) {
      <p class="text-error text-xs mt-2 flex items-center gap-1">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
        {{ errorMsg() }}
      </p>
    }
  `,
})
export class FileUploadComponent {
  @Input() accept = '*/*';
  @Input() label = 'Drop a file or click to browse';
  @Output() fileUploaded = new EventEmitter<UploadResult>();

  private readonly api = inject(ApiService);

  dragOver = signal(false);
  uploading = signal(false);
  uploaded = signal<UploadResult | null>(null);
  errorMsg = signal<string | null>(null);

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.upload(file);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.upload(file);
  }

  private upload(file: File): void {
    this.uploading.set(true);
    this.errorMsg.set(null);

    this.api.uploadFile(file).subscribe({
      next: (result) => {
        this.uploaded.set(result);
        this.uploading.set(false);
        this.fileUploaded.emit(result);
      },
      error: (err) => {
        this.errorMsg.set(err?.error?.error ?? 'Upload failed. Please try again.');
        this.uploading.set(false);
      },
    });
  }
}
