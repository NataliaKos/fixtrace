import { Component, inject, OnInit, OnDestroy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { VoiceService } from '../../services/voice.service';
import { IssuesListComponent } from '../../components/issues-list/issues-list.component';
import { FileUploadComponent } from '../../components/file-upload/file-upload.component';
import { CodeInputComponent } from '../../components/code-input/code-input.component';
import { FileTreeComponent } from '../../components/file-tree/file-tree.component';
import { DiffViewerComponent } from '../../components/diff-viewer/diff-viewer.component';
import { MonacoEditorComponent } from '../../components/monaco-editor/monaco-editor.component';
import { AnalyzerStateService } from '../../state/analyzer-state.service';
import { ChatPanelBridgeService } from '../../services/chat-panel-bridge.service';
import { ContextImage } from '../../services/live-audio-ws.service';
import { filter, Subscription, take } from 'rxjs';
import { HeaderComponent } from '../../components/header/header';
import { ChatPanelComponent } from '../../components/chat-panel/chat-panel.component';
import { DemoTourComponent } from '../../components/demo-tour/demo-tour.component';
import { DemoTourService } from '../../services/demo-tour.service';

@Component({
  selector: 'app-analyzer',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    IssuesListComponent,
    FileUploadComponent,
    CodeInputComponent,
    FileTreeComponent,
    DiffViewerComponent,
    MonacoEditorComponent,
    HeaderComponent,
    ChatPanelComponent,
    DemoTourComponent,
  ],
  templateUrl: './analyzer.component.html',
})
export class AnalyzerPageComponent implements OnInit, OnDestroy {
  readonly state = inject(AnalyzerStateService);
  readonly voiceService = inject(VoiceService);
  private readonly bridge = inject(ChatPanelBridgeService);
  private readonly router = inject(Router);
  private readonly tourService = inject(DemoTourService);


  readonly waveformBars = [0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.8, 1.0, 0.3, 0.7, 0.6, 0.9];

  private audioSub?: Subscription;

  ngOnInit(): void {
    // Start tour after the first navigation completes so the lazy-loaded
    // route component is fully rendered and data-tour elements are in the DOM.
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      take(1),
    ).subscribe(() => {
      this.tourService.startIfFirstVisit();
    });

    this.audioSub = this.voiceService.audioReady$.subscribe(({ base64, mimeType }) => {
      this.state.transcribeAndAppend(base64, mimeType);
    });
  }

  ngOnDestroy(): void {
    this.audioSub?.unsubscribe();
  }

  toggleVoice(): void {
    this.voiceService.toggleRecording();
  }

  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async openChatWithContext(): Promise<void> {
    // ── 1. Build summary text ──────────────────────────────────────────────
    const baseText = this.state.buildContextText(this.state.mode() as any) ?? '';

    // ── 2. Append full code (original + suggested) ─────────────────────────
    const codeLines: string[] = [];
    const CHAR_LIMIT = 2500;

    for (const file of this.state.codeFiles().slice(0, 3)) {
      const snippet = file.content.length > CHAR_LIMIT
        ? file.content.slice(0, CHAR_LIMIT) + '\n// … (truncated)'
        : file.content;
      codeLines.push(`\n### Original: ${file.path}\n\`\`\`${file.language ?? ''}\n${snippet}\n\`\`\``);
    }

    const patches = this.state.codeResult()?.patches ?? this.state.enhanceResult()?.patches ?? [];
    for (const patch of patches.slice(0, 3)) {
      const snippet = patch.modified.length > CHAR_LIMIT
        ? patch.modified.slice(0, CHAR_LIMIT) + '\n// … (truncated)'
        : patch.modified;
      codeLines.push(`\n### Suggested: ${patch.filePath}\n\`\`\`\n${snippet}\n\`\`\``);
    }

    const fullText = codeLines.length
      ? `${baseText}\n\n## Full Code Context\n${codeLines.join('\n')}`
      : baseText;

    // ── 3. Build image attachments ─────────────────────────────────────────
    const images: ContextImage[] = [];

    // Original user screenshot (already on GCS)
    const uploaded = this.state.uploadedFile();
    if (uploaded?.gcsUri && uploaded.mimeType.startsWith('image/')) {
      images.push({ gcsUri: uploaded.gcsUri, mimeType: uploaded.mimeType });
    }

    // AI-generated enhanced UI image — fetch and encode as base64
    const enhancedUrl = this.state.enhanceResult()?.imageUrl;
    if (enhancedUrl) {
      try {
        const resp  = await fetch(enhancedUrl);
        const buf   = await resp.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary  = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode(...(bytes.subarray(i, i + CHUNK) as unknown as number[]));
        }
        images.push({ data: btoa(binary), mimeType: resp.headers.get('content-type') ?? 'image/jpeg' });
      } catch { /* skip if fetch fails */ }
    }

    // ── 4. Open the panel ─────────────────────────────────────────────────
    if (fullText) {
      this.bridge.openWithContext(fullText, images);
    } else {
      this.bridge.open();
    }
  }
}
