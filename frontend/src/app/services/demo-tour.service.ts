import { Injectable, signal, computed, WritableSignal } from '@angular/core';

export type TourPosition = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface TourStep {
  id: string;
  /** CSS selector targeting the element to highlight */
  selector: string;
  title: string;
  description: string;
  tip?: string;
  position?: TourPosition;
  /** Extra padding (px) around the spotlight box */
  padding?: number;
}

// ─── Step Definitions ────────────────────────────────────────────────────────
// Steps that reference page-specific selectors are naturally skipped when
// those elements are absent from the DOM (different route / hidden state).

const TOUR_STEPS: TourStep[] = [
  {
    id: 'logo',
    selector: '[data-tour="logo"]',
    title: 'Welcome to FixTrace',
    description:
      'FixTrace uses multimodal AI to analyse your UI and code, then surfaces exactly what to fix — and why.',
    tip: 'Click the logo anytime to return to the homepage.',
    position: 'bottom',
    padding: 10,
  },
  {
    id: 'nav-analyzer',
    selector: '[data-tour="nav-analyzer"]',
    title: 'Analyzer',
    description:
      'Navigate to the Analyzer to upload screenshots, screen recordings, or pasted code for a full AI audit.',
    tip: 'Supports UI review, enhancement suggestions, and Lighthouse / DevTools performance reports.',
    position: 'bottom',
  },
  {
    id: 'theme-toggle',
    selector: '[data-tour="theme-toggle"]',
    title: 'Theme Toggle',
    description: 'Switch between light and dark mode. FixTrace remembers your preference across sessions.',
    position: 'bottom',
  },
  {
    id: 'help-btn',
    selector: '[data-tour="help-btn"]',
    title: 'Help & Tour',
    description: 'This "?" button is always here. Click it anytime to replay this walkthrough.',
    position: 'bottom',
  },
  {
    id: 'chat-btn',
    selector: '[data-tour="chat-btn"]',
    title: 'AI Avatar Chat',
    description:
      'Open a live multimodal chat with the FixTrace AI Avatar. Ask questions by text or voice, and the avatar responds with audio and animation.',
    tip: 'After running an analysis, use "Discuss with AI" to send results directly into this chat.',
    position: 'top',
  },
  // ── Home page ──────────────────────────────────────────────────────────────
  {
    id: 'hero-analyze-btn',
    selector: '[data-tour="hero-analyze-btn"]',
    title: 'Analyze a Screenshot',
    description:
      'Upload any UI screenshot to receive scored, categorised issues with specific fix suggestions — covering accessibility, layout, Core Web Vitals, and more.',
    tip: 'Drag-and-drop or click to browse from disk.',
    position: 'right',
  },
  {
    id: 'hero-live-btn',
    selector: '[data-tour="hero-live-btn"]',
    title: 'Live Agent',
    description:
      'Chat in real time — via text or voice — with the FixTrace AI. Attach files for multimodal analysis and follow-up questions.',
    tip: 'The agent carries context from your Analyzer session automatically.',
    position: 'right',
  },
  // ── Analyzer page ──────────────────────────────────────────────────────────
  {
    id: 'mode-toggle',
    selector: '[data-tour="mode-toggle"]',
    title: 'Analysis Mode',
    description:
      'Choose between UI Analyzer (layout + accessibility), UI Enhancement (AI redesign diff), or Performance (Core Web Vitals + bundle).',
    tip: 'Each mode routes your file to a different specialised AI pipeline.',
    position: 'bottom',
  },
  {
    id: 'file-upload',
    selector: '[data-tour="file-upload"]',
    title: 'File Upload',
    description:
      'Drag and drop a screenshot, screen recording, or Lighthouse report. Click to browse files.',
    tip: 'Accepts images (PNG/JPEG/WebP), videos (MP4/WebM), and Lighthouse JSON traces.',
    position: 'right',
  },
  {
    id: 'code-input',
    selector: '[data-tour="code-input"]',
    title: 'Code Input',
    description:
      'Paste code snippets, upload files, or connect a GitHub repo to receive code-level suggestions and unified diff patches.',
    tip: 'Supports multiple files and full folder/repo structures.',
    position: 'top',
  },
  {
    id: 'context-area',
    selector: '[data-tour="context-area"]',
    title: 'Context & Voice Input',
    description:
      'Add analysis context in plain text — or click the 🎤 button to dictate by voice. More detail → higher-quality AI output.',
    tip: 'Example: "Focus on mobile responsiveness and accessibility for these payment forms."',
    position: 'top',
  },
  {
    id: 'run-analysis',
    selector: '[data-tour="run-analysis"]',
    title: 'Run Analysis',
    description:
      'Send all your inputs to the AI pipeline. Results appear below with a score, issues list, and fix diffs.',
    tip: 'Use "Discuss with AI" under the results to deep-dive with the Live Agent.',
    position: 'top',
  },
];

const LS_KEY = 'demo-tour-seen';

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DemoTourService {
  // ── Public reactive state ──────────────────────────────────────────────────
  readonly isActive = signal(false);
  readonly currentIndex = signal(0);
  readonly stepCount = signal(0);
  readonly currentStep = computed(() => this._activeSteps()[this.currentIndex()] ?? null);

  // ── Private ────────────────────────────────────────────────────────────────
  private readonly _activeSteps: WritableSignal<TourStep[]> = signal([]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Call from AppComponent.ngOnInit — starts only if the user has never seen the tour. */
  get hasSeenTour(): boolean {
    return localStorage.getItem(LS_KEY) === 'true';
  }

  startIfFirstVisit(): void {
    if (localStorage.getItem(LS_KEY) !== 'true') {
      this.start();
    }
  }

  /** Force-start (e.g. from the "?" help button). */
  start(): void {
    const steps = this._buildActiveSteps();
    if (steps.length === 0) {
      console.warn('[DemoTour] No data-tour elements found in DOM — tour aborted.');
      return;
    }
    this._activeSteps.set(steps);
    this.stepCount.set(steps.length);
    this.currentIndex.set(0);
    this.isActive.set(true);
  }

  /** Remove the seen flag and restart from the first visible step. */
  restart(): void {
    localStorage.removeItem(LS_KEY);
    this.start();
  }

  next(): void {
    const next = this.currentIndex() + 1;
    if (next >= this._activeSteps().length) {
      this.end();
    } else {
      this.currentIndex.set(next);
    }
  }

  prev(): void {
    const prev = this.currentIndex() - 1;
    if (prev >= 0) this.currentIndex.set(prev);
  }

  end(): void {
    this.isActive.set(false);
    localStorage.setItem(LS_KEY, 'true');
  }

  skip(): void {
    this.end();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Filters the master list to steps whose target element is in the current DOM. */
  private _buildActiveSteps(): TourStep[] {
    const found = TOUR_STEPS.filter((s) => !!document.querySelector(s.selector));
    return found;
  }
}
