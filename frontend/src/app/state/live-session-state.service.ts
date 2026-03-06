import { Injectable, signal, inject } from '@angular/core';
import { ApiService } from '../services/api.service';
import type { ChatMessage, LiveSessionState, UploadResult, SessionMode } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class LiveSessionStateService {
  private readonly api = inject(ApiService);

  readonly session = signal<LiveSessionState | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly sending = signal(false);
  readonly starting = signal(false);
  readonly selectedMode = signal<SessionMode>('ui');
  readonly attachedFile = signal<UploadResult | null>(null);

  startSession(onStarted?: () => void): void {
    this.starting.set(true);
    this.api.createSession(this.selectedMode()).subscribe({
      next: (sessionState) => {
        this.session.set(sessionState);
        this.messages.set([]);
        this.starting.set(false);
        onStarted?.();
      },
      error: () => this.starting.set(false),
    });
  }

  endSession(): void {
    const s = this.session();
    if (s) this.api.deleteSession(s.config.sessionId).subscribe();
    this.session.set(null);
    this.messages.set([]);
  }

  sendMessage(text: string): void {
    const s = this.session();
    if (!s || !text.trim()) return;

    const attachment = this.attachedFile();
    const attachments = attachment
      ? [{ gcsUri: attachment.gcsUri, mimeType: attachment.mimeType }]
      : undefined;

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      attachments,
    };
    this.messages.update((msgs) => [...msgs, userMsg]);
    this.attachedFile.set(null);
    this.sending.set(true);
    this.api.sendMessage(s.config.sessionId, text, attachments).subscribe({
      next: (reply) => {
        this.messages.update((msgs) => [...msgs, reply]);
        this.sending.set(false);
      },
      error: (err: any) => {
        if (err?.status === 404) {
          this.messages.update((msgs) => [
            ...msgs,
            { role: 'model', content: '⚠️ Session expired — reconnecting…', timestamp: new Date().toISOString() },
          ]);
          this.sending.set(false);
          this.starting.set(true);
          this.api.createSession(this.selectedMode()).subscribe({
            next: (state) => { this.session.set(state); this.starting.set(false); },
            error: () => this.starting.set(false),
          });
        } else {
          this.messages.update((msgs) => [
            ...msgs,
            { role: 'model', content: '⚠️ Error: could not get response.', timestamp: new Date().toISOString() },
          ]);
          this.sending.set(false);
        }
      },
    });
  }

  handleVoiceAudio(base64: string, mimeType: string): void {
    const userMsg: ChatMessage = {
      role: 'user',
      content: '🎤 Voice message',
      timestamp: new Date().toISOString(),
      isAudio: true,
    };
    this.messages.update((msgs) => [...msgs, userMsg]);
    this.sendVoice(base64, mimeType);
  }

  sendVoice(base64: string, mimeType: string): void {
    const s = this.session();
    if (!s) return;

    this.sending.set(true);

    this.api.transcribeAudio(base64, mimeType).subscribe({
      next: (transcript) => {
        this.messages.update((msgs) => {
          const updated = [...msgs];
          let lastVoice = -1;
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].isAudio && updated[i].role === 'user') { lastVoice = i; break; }
          }
          if (lastVoice >= 0) updated[lastVoice] = { ...updated[lastVoice], content: `🎤 "${transcript}"` };
          return updated;
        });

        this.api.sendMessage(s.config.sessionId, transcript).subscribe({
          next: (reply) => {
            this.messages.update((msgs) => [...msgs, reply]);
            this.sending.set(false);
          },
          error: () => {
            this.messages.update((msgs) => [
              ...msgs,
              { role: 'model', content: '⚠️ Error: could not get response.', timestamp: new Date().toISOString() },
            ]);
            this.sending.set(false);
          },
        });
      },
      error: () => {
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'model', content: '⚠️ Could not transcribe voice. Please try again or type your message.', timestamp: new Date().toISOString() },
        ]);
        this.sending.set(false);
      },
    });
  }
}
