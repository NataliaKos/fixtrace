/**
 * ChatPanelComponent
 *
 * Floating chat panel backed by a Gemini Live API WebSocket session.
 * All communication (text and voice) goes through LiveAudioWsService which
 * proxies to the backend /api/live-audio WebSocket endpoint.
 *
 * Streaming audio from Gemini is fed chunk-by-chunk into AvatarSceneComponent
 * so the avatar jaw animation starts the moment the first audio chunk arrives.
 */

import {
  Component,
  signal,
  inject,
  ViewChild,
  HostListener,
  ElementRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LiveAudioWsService, ContextImage } from '../../services/live-audio-ws.service';
import { ChatPanelBridgeService } from '../../services/chat-panel-bridge.service';
import { AvatarSceneComponent } from '../avatar-scene/avatar-scene.component';
import { Subscription } from 'rxjs';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [FormsModule, AvatarSceneComponent],
  providers: [LiveAudioWsService],
  template: `
    <!-- ── Floating trigger button ──────────────────────────────────── -->
    <button
      class="fixed bottom-6 right-6 z-[9999] btn btn-circle btn-lg shadow-xl bg-primary text-primary-content hover:bg-primary/90 transition-transform hover:scale-110"
      title="Ask AI Avatar"
      (click)="open()"
      aria-label="Open AI Avatar chat"
      data-tour="chat-btn"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" opacity=".15"/>
        <path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003z"/>
      </svg>
    </button>

    <!-- ── Draggable modal panel ───────────────────────────────────────── -->
    @if (isOpen()) {
      <div
        #modal
        class="fixed z-[9999] right-6 bottom-24 rounded-2xl shadow-2xl flex flex-col overflow-hidden bg-base-100 border border-base-300/60"
        [style.transform]="'translate(' + dragX() + 'px, ' + dragY() + 'px)'"
        [style.width.px]="400"
        style="max-height: calc(100vh - 7rem);"
      >
        <!-- ── Drag handle / header ─────────────────────────────────── -->
        <div
          class="flex items-center justify-between px-4 py-3 bg-base-200/80 backdrop-blur-sm cursor-grab active:cursor-grabbing select-none border-b border-base-300/60"
          (mousedown)="startDrag($event)"
        >
          <div class="flex items-center gap-2">
            <span class="text-base-content/70 font-medium text-sm">AI Avatar</span>
            @if (loading()) {
              <span class="loading loading-spinner loading-xs text-primary"></span>
            }
            @if (!liveAudio.isConnected() && !loading()) {
              <span class="text-xs text-base-content/40">connecting…</span>
            }
          </div>
          <div class="flex items-center gap-1">
            <button class="btn btn-ghost btn-xs btn-circle" (click)="close()" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- ── Avatar canvas ──────────────────────────────────────────── -->
        <div class="relative bg-base-200/40" style="height:220px;">
          <app-avatar-scene #avatar style="height:220px;display:block;" />
        </div>

        <!-- ── Voice recording indicator ─────────────────────────────── -->
        @if (liveAudio.isRecording()) {
          <div class="flex items-center gap-2 px-4 py-2 bg-error/10 border-t border-error/20">
            <span class="w-2 h-2 rounded-full bg-error animate-pulse"></span>
            <span class="text-xs font-medium text-error">Recording…</span>
            <!-- Real-time audio level bar -->
            <div class="flex-1 mx-2 h-1.5 bg-error/20 rounded-full overflow-hidden">
              <div
                class="h-full bg-error rounded-full transition-all duration-75"
                [style.width.%]="liveAudio.audioLevel() * 100"
              ></div>
            </div>
          </div>
        }

        <!-- ── Input bar ──────────────────────────────────────────────── -->
        <div class="p-3 border-t border-base-300/60 flex gap-2">
          <input
            type="text"
            class="input input-sm input-bordered flex-1 bg-base-100 text-sm"
            placeholder="Ask anything…"
            [(ngModel)]="inputText"
            (keydown.enter)="send()"
            [disabled]="loading() || !liveAudio.isConnected() || liveAudio.isRecording()"
          />

          <!-- Voice button -->
          <button
            class="btn btn-sm btn-circle transition-all duration-200"
            [class.btn-error]="liveAudio.isRecording()"
            [class.btn-ghost]="!liveAudio.isRecording()"
            [class.animate-pulse]="liveAudio.isRecording()"
            [disabled]="!liveAudio.isConnected()"
            (click)="toggleVoice()"
            [title]="liveAudio.isRecording() ? 'Stop recording' : 'Start voice input'"
            [attr.aria-label]="liveAudio.isRecording() ? 'Stop recording' : 'Start voice input'"
          >
            @if (liveAudio.isRecording()) {
              <!-- Stop icon -->
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            } @else {
              <!-- Mic icon -->
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            }
          </button>

          <button
            class="btn btn-sm btn-primary"
            [disabled]="!inputText.trim() || loading() || !liveAudio.isConnected()"
            (click)="send()"
          >Send</button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
  `],
})
export class ChatPanelComponent implements OnInit, OnDestroy {
  @ViewChild('avatar') private avatarRef!: AvatarSceneComponent;
  @ViewChild('msgList') private msgListRef!: ElementRef<HTMLDivElement>;

  readonly liveAudio = inject(LiveAudioWsService);
  private readonly bridge = inject(ChatPanelBridgeService);

  // ── State ──────────────────────────────────────────────────────────────────
  readonly isOpen = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly messages = signal<Message[]>([]);
  inputText = '';
  private pendingContext = '';
  private pendingContextImages: ContextImage[] = [];

  // ── Modal drag (offset from bottom-right anchor) ───────────────────────────
  readonly dragX = signal(0);
  readonly dragY = signal(0);

  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragBaseX = 0;
  private dragBaseY = 0;

  private readonly subs: Subscription[] = [];

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.subs.push(
      // Bridge: open panel (optionally with context) from other components
      this.bridge.open$.subscribe((req) => {
        if (req.text) {
          this.openWithContext(req.text, req.images ?? []);
        } else {
          this.open();
        }
      }),

      // Send pending context once Gemini session is ready
      this.liveAudio.connected$.subscribe(() => {
        if (this.pendingContext) {
          const ctx = this.pendingContext;
          const imgs = this.pendingContextImages;
          this.pendingContext = '';
          this.pendingContextImages = [];
          // Show a concise label in the chat UI (full context text can be thousands of chars)
          const label = ctx.split('\n')[0]?.replace(/^#+\s*/, '') ?? 'Analysis results';
          this.messages.update((m) => [...m, { role: 'user', text: label }]);
          this.loading.set(true);
          this.avatarRef?.startStreamPlayback();
          this.scrollToBottom();
          if (imgs.length > 0) {
            this.liveAudio.sendContextWithMedia(ctx, imgs);
          } else {
            this.liveAudio.sendText(ctx);
          }
        }
      }),

      // 24 kHz PCM audio chunks → avatar playback
      this.liveAudio.pcmChunk$.subscribe((pcm) => {
        this.avatarRef?.queuePcmChunk(pcm);
      }),

      // AI spoken reply transcript
      this.liveAudio.textOutput$.subscribe((text) => {
        this.messages.update((m) => [...m, { role: 'assistant', text }]);
        this.scrollToBottom();
      }),

      // User voice transcript (arrives soon after recording stops)
      this.liveAudio.inputTranscript$.subscribe((text) => {
        this.messages.update((m) => [...m, { role: 'user', text: `🎤 "${text}"` }]);
        this.scrollToBottom();
      }),

      // AI finished its turn
      this.liveAudio.turnComplete$.subscribe(() => {
        this.loading.set(false);
        this.avatarRef?.stopStreamPlayback();
      }),

      // Non-fatal errors
      this.liveAudio.error$.subscribe((msg) => {
        this.error.set(msg);
        this.loading.set(false);
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.liveAudio.disconnect();
  }

  // ── Open / close ───────────────────────────────────────────────────────────
  open(): void {
    this.dragX.set(0);
    this.dragY.set(0);
    this.isOpen.set(true);
    this.liveAudio.connect('', 'ui');
  }

  openWithContext(text: string, images: ContextImage[] = []): void {
    this.pendingContext = text;
    this.pendingContextImages = images;
    this.open();
  }

  close(): void {
    this.isOpen.set(false);
    this.liveAudio.disconnect();
    this.avatarRef?.stopStreamPlayback();
  }

  // ── Voice recording ────────────────────────────────────────────────────────
  toggleVoice(): void {
    if (this.liveAudio.isRecording()) {
      this.liveAudio.stopRecording();
      this.avatarRef?.setListening(false);
      this.loading.set(true);
      this.avatarRef?.startStreamPlayback();
    } else {
      this.error.set('');
      this.liveAudio.startRecording().catch((err: unknown) => {
        this.error.set(err instanceof Error ? err.message : 'Microphone access denied');
      });
      this.avatarRef?.setListening(true);
    }
  }

  // ── Send text ──────────────────────────────────────────────────────────────
  send(): void {
    const text = this.inputText.trim();
    if (!text || this.loading() || !this.liveAudio.isConnected()) return;

    this.inputText = '';
    this.error.set('');
    this.messages.update((m) => [...m, { role: 'user', text }]);
    this.loading.set(true);
    this.scrollToBottom();

    this.avatarRef?.startStreamPlayback();
    this.liveAudio.sendText(text);
  }

  // ── Drag ───────────────────────────────────────────────────────────────────
  startDrag(e: MouseEvent): void {
    this.dragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragBaseX = this.dragX();
    this.dragBaseY = this.dragY();
    e.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (!this.dragging) return;
    this.dragX.set(this.dragBaseX + (e.clientX - this.dragStartX));
    this.dragY.set(this.dragBaseY + (e.clientY - this.dragStartY));
  }

  @HostListener('document:mouseup')
  onMouseUp(): void { this.dragging = false; }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.msgListRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }
}
