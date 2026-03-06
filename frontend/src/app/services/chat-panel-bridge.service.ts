import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { ContextImage } from './live-audio-ws.service';

export interface OpenRequest {
  text?: string;
  images?: ContextImage[];
}

@Injectable({ providedIn: 'root' })
export class ChatPanelBridgeService {
  private readonly _open$ = new Subject<OpenRequest>();
  /** Emit to instruct the ChatPanelComponent to open (optionally with context). */
  readonly open$ = this._open$.asObservable();

  open(): void {
    this._open$.next({});
  }

  openWithContext(text: string, images: ContextImage[] = []): void {
    this._open$.next({ text, images });
  }
}
