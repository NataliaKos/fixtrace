import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface AudioReadyEvent {
  base64: string;
  mimeType: string;
}

@Injectable({ providedIn: 'root' })
export class VoiceService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  readonly isRecording = signal(false);
  /** Audio level 0-1 (RMS), updated ~60 fps while recording */
  readonly audioLevel = signal(0);
  /** Duration in seconds of current recording */
  readonly recordingDuration = signal(0);
  readonly audioReady$ = new Subject<AudioReadyEvent>();

  private recordingStartTime = 0;
  private durationInterval: ReturnType<typeof setInterval> | null = null;
  private readonly MAX_DURATION_SEC = 60;
  private autoStopTimeout: ReturnType<typeof setTimeout> | null = null;

  async startRecording(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(stream, { mimeType });
    this.audioChunks = [];

    // Set up audio analysis for waveform visualization
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    source.connect(this.analyserNode);
    this.startAudioLevelMonitoring();

    // Track duration
    this.recordingStartTime = Date.now();
    this.recordingDuration.set(0);
    this.durationInterval = setInterval(() => {
      this.recordingDuration.set(Math.floor((Date.now() - this.recordingStartTime) / 1000));
    }, 500);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.audioChunks.push(event.data);
    };

    this.mediaRecorder.onstop = async () => {
      const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const base64 = await this.blobToBase64(blob);
      this.audioReady$.next({ base64, mimeType: 'audio/webm' });
      stream.getTracks().forEach((track) => track.stop());
      this.stopAudioLevelMonitoring();
    };

    this.mediaRecorder.start();
    this.isRecording.set(true);

    // Auto-stop after max duration
    this.autoStopTimeout = setTimeout(() => {
      if (this.isRecording()) this.stopRecording();
    }, this.MAX_DURATION_SEC * 1000);
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.isRecording()) {
      this.mediaRecorder.stop();
      this.isRecording.set(false);
      if (this.durationInterval) {
        clearInterval(this.durationInterval);
        this.durationInterval = null;
      }
      if (this.autoStopTimeout) {
        clearTimeout(this.autoStopTimeout);
        this.autoStopTimeout = null;
      }
    }
  }

  toggleRecording(): void {
    if (this.isRecording()) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  playBase64Audio(base64: string, mimeType = 'audio/webm'): void {
    const audio = new Audio(`data:${mimeType};base64,${base64}`);
    audio.play();
  }

  private startAudioLevelMonitoring(): void {
    if (!this.analyserNode) return;
    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

    const update = () => {
      if (!this.analyserNode) return;
      this.analyserNode.getByteTimeDomainData(dataArray);

      // Calculate RMS level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      this.audioLevel.set(Math.min(1, rms * 3)); // amplify for visual feedback

      this.animFrameId = requestAnimationFrame(update);
    };
    update();
  }

  private stopAudioLevelMonitoring(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyserNode = null;
    this.audioLevel.set(0);
    this.recordingDuration.set(0);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] ?? '');
      };
      reader.readAsDataURL(blob);
    });
  }
}
