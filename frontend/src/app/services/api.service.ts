import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import type {
  ApiResponse,
  UiAnalysisResult,
  PerfAnalysisResult,
  UploadResult,
  LiveSessionState,
  ChatMessage,
  SessionMode,
  CodeAnalysisRequest,
  CodeAnalysisResult,
  GitHubCloneResult,
  UiEnhanceRequest,
  UiEnhanceResult,
} from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  // ── Upload ──────────────────────────────────────────────────────────

  uploadFile(file: File): Observable<UploadResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http
      .post<ApiResponse<UploadResult>>(`${this.base}/api/upload`, form)
      .pipe(map((r) => r.data!));
  }

  // ── UI Analysis ─────────────────────────────────────────────────────

  analyzeUi(
    fileId: string,
    gcsUri: string,
    mimeType: string,
    userPrompt?: string,
  ): Observable<UiAnalysisResult> {
    return this.http
      .post<ApiResponse<UiAnalysisResult>>(`${this.base}/api/ui-analyze`, {
        fileId,
        gcsUri,
        mimeType,
        userPrompt,
      })
      .pipe(map((r) => r.data!));
  }

  // ── UI Enhancement ──────────────────────────────────────────────────

  enhanceUi(request: UiEnhanceRequest): Observable<UiEnhanceResult> {
    return this.http
      .post<ApiResponse<UiEnhanceResult>>(`${this.base}/api/ui-enhance`, request)
      .pipe(map((r) => r.data!));
  }

  // ── Performance Analysis ─────────────────────────────────────────────

  analyzePerf(
    fileId: string,
    gcsUri: string,
    mimeType: string,
    userPrompt?: string,
  ): Observable<PerfAnalysisResult> {
    return this.http
      .post<ApiResponse<PerfAnalysisResult>>(`${this.base}/api/perf-analyze`, {
        fileId,
        gcsUri,
        mimeType,
        userPrompt,
      })
      .pipe(map((r) => r.data!));
  }

  // ── Live Session ─────────────────────────────────────────────────────

  createSession(mode: SessionMode = 'both'): Observable<LiveSessionState> {
    return this.http
      .post<ApiResponse<LiveSessionState>>(`${this.base}/api/live-session`, { mode })
      .pipe(map((r) => r.data!));
  }

  sendMessage(
    sessionId: string,
    content: string,
    attachments?: { gcsUri: string; mimeType: string }[],
  ): Observable<ChatMessage> {
    return this.http
      .post<ApiResponse<ChatMessage>>(
        `${this.base}/api/live-session/${sessionId}/message`,
        { content, attachments },
      )
      .pipe(map((r) => r.data!));
  }

  sendVoiceMessage(
    sessionId: string,
    audioBase64: string,
    audioMimeType: string,
    textPrompt?: string,
  ): Observable<ChatMessage> {
    return this.http
      .post<ApiResponse<ChatMessage>>(
        `${this.base}/api/live-session/${sessionId}/voice`,
        { audioBase64, audioMimeType, textPrompt },
      )
      .pipe(map((r) => r.data!));
  }

  deleteSession(sessionId: string): Observable<void> {
    return this.http
      .delete<ApiResponse>(`${this.base}/api/live-session/${sessionId}`)
      .pipe(map(() => void 0));
  }

  // ── GitHub Clone ──────────────────────────────────────────────────

  cloneGitHubRepo(repoUrl: string): Observable<GitHubCloneResult> {
    return this.http
      .post<ApiResponse<GitHubCloneResult>>(`${this.base}/api/github-clone`, { repoUrl })
      .pipe(map((r) => r.data!));
  }

  // ── Code Analysis ─────────────────────────────────────────────────

  analyzeCode(request: CodeAnalysisRequest): Observable<CodeAnalysisResult> {
    return this.http
      .post<ApiResponse<CodeAnalysisResult>>(`${this.base}/api/code-analyze`, request)
      .pipe(map((r) => r.data!));
  }

  // ── Voice Transcription ──────────────────────────────────────────

  transcribeAudio(audioBase64: string, audioMimeType: string): Observable<string> {
    return this.http
      .post<ApiResponse<{ text: string }>>(`${this.base}/api/voice/transcribe`, {
        audioBase64,
        audioMimeType,
      })
      .pipe(map((r) => r.data!.text));
  }

  // ── Text-to-Speech ───────────────────────────────────────────────

  synthesizeVoice(text: string, voice?: string): Observable<string> {
    return this.http
      .post<ApiResponse<{ audioBase64: string }>>(`${this.base}/api/tts`, { text, voice })
      .pipe(map((r) => r.data!.audioBase64));
  }
}
