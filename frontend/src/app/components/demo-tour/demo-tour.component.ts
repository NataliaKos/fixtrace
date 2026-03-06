import {
  Component,
  inject,
  signal,
  computed,
  DestroyRef,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { DemoTourService, TourStep } from '../../services/demo-tour.service';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: number;
}

interface PopoverRect {
  top: number;
  left: number;
  transformOrigin: string;
}

const POPOVER_W = 320;
const POPOVER_H_EST = 240;
const GAP = 14;

@Component({
  selector: 'app-demo-tour',
  standalone: true,
  template: `
    @if (tour.isActive()) {
      <!-- ── Backdrop (clickable dark overlay — handled by spotlight box-shadow) ── -->
      <div
        class="dt-backdrop"
        (click)="tour.skip()"
        aria-hidden="true"
      ></div>

      <!-- ── Spotlight ──────────────────────────────────────────────────────── -->
      @if (spotlight()) {
        <div
          class="dt-spotlight"
          [style.top.px]="spotlight()!.top"
          [style.left.px]="spotlight()!.left"
          [style.width.px]="spotlight()!.width"
          [style.height.px]="spotlight()!.height"
          [style.border-radius.px]="spotlight()!.borderRadius"
          aria-hidden="true"
        ></div>
      }

      <!-- ── Popover ────────────────────────────────────────────────────────── -->
      @if (popover() && tour.currentStep()) {
        <div
          class="dt-popover"
          role="dialog"
          aria-modal="false"
          [attr.aria-label]="tour.currentStep()!.title"
          [style.top.px]="popover()!.top"
          [style.left.px]="popover()!.left"
          [style.width.px]="POPOVER_W"
          [style.transform-origin]="popover()!.transformOrigin"
          tabindex="-1"
        >
          <!-- Header row -->
          <div class="dt-popover__header">
            <span class="dt-popover__step-badge" aria-label="Step {{ tour.currentIndex() + 1 }} of {{ tour.stepCount() }}">
              {{ tour.currentIndex() + 1 }}&thinsp;<span class="dt-popover__step-total">/ {{ tour.stepCount() }}</span>
            </span>
            <button
              class="dt-popover__close"
              (click)="tour.skip()"
              type="button"
              aria-label="Skip tour"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Progress bar -->
          <div class="dt-popover__progress" role="progressbar"
            [attr.aria-valuenow]="tour.currentIndex() + 1"
            [attr.aria-valuemin]="1"
            [attr.aria-valuemax]="tour.stepCount()">
            <div
              class="dt-popover__progress-fill"
              [style.width.%]="((tour.currentIndex() + 1) / tour.stepCount()) * 100"
            ></div>
          </div>

          <!-- Body -->
          <div class="dt-popover__body">
            <h3 class="dt-popover__title">{{ tour.currentStep()!.title }}</h3>
            <p class="dt-popover__desc">{{ tour.currentStep()!.description }}</p>
            @if (tour.currentStep()!.tip) {
              <div class="dt-popover__tip" role="note">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
                  stroke-linejoin="round" aria-hidden="true" class="dt-popover__tip-icon">
                  <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                </svg>
                <span>{{ tour.currentStep()!.tip }}</span>
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="dt-popover__footer">
            <button
              class="dt-popover__skip-btn"
              (click)="tour.skip()"
              type="button"
            >
              Skip tour
            </button>

            <div class="dt-popover__nav" role="group" aria-label="Tour navigation">
              @if (tour.currentIndex() > 0) {
                <button
                  class="dt-popover__nav-btn dt-popover__nav-btn--prev"
                  (click)="tour.prev()"
                  type="button"
                  aria-label="Previous step"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
                    stroke-linejoin="round" aria-hidden="true">
                    <path d="m15 18-6-6 6-6"/>
                  </svg>
                </button>
              }
              <button
                class="dt-popover__nav-btn dt-popover__nav-btn--next"
                (click)="tour.next()"
                type="button"
                [attr.aria-label]="isLastStep() ? 'Finish tour' : 'Next step'"
              >
                @if (isLastStep()) {
                  Got it!
                } @else {
                  Next
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
                    stroke-linejoin="round" aria-hidden="true">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                }
              </button>
            </div>
          </div>
        </div>
      }
    }
  `,
  styles: [':host { display: contents; }'],
})
export class DemoTourComponent implements OnDestroy {
  readonly tour = inject(DemoTourService);

  readonly POPOVER_W = POPOVER_W;

  readonly spotlight = signal<SpotlightRect | null>(null);
  readonly popover   = signal<PopoverRect | null>(null);
  readonly isLastStep = computed(
    () => this.tour.currentIndex() >= this.tour.stepCount() - 1,
  );

  private _layoutTimer: ReturnType<typeof setTimeout> | null = null;
  private _resizeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Subscribe to isActive + currentStep together so we react correctly
    // when either changes (step nav OR tour start/stop).
    combineLatest([
      toObservable(this.tour.isActive),
      toObservable(this.tour.currentStep),
    ]).pipe(
      takeUntilDestroyed(destroyRef),
    ).subscribe(([active, step]) => {
      if (active && step) {
        this._scheduleLayout(step);
      } else if (!active) {
        this._clearTimers();
        this.spotlight.set(null);
        this.popover.set(null);
      }
    });
  }

  ngOnDestroy(): void {
    this._clearTimers();
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (!this.tour.isActive()) return;
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.tour.skip();
        break;
      case 'ArrowRight':
      case 'Enter':
        e.preventDefault();
        this.tour.next();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.tour.prev();
        break;
    }
  }

  // ── Responsive reflow ──────────────────────────────────────────────────────

  @HostListener('window:resize')
  onResize(): void {
    if (!this.tour.isActive()) return;
    if (this._resizeTimer) clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(() => {
      const step = this.tour.currentStep();
      if (step) this._computeLayout(step);
    }, 80);
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private _scheduleLayout(step: TourStep): void {
    this._clearTimers();

    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) {
      console.warn('[DemoTour] Element not found for selector:', step.selector);
      return;
    }

    // Scroll instantly so we can measure immediately (smooth scroll causes
    // stale getBoundingClientRect readings while the animation is in flight).
    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });

    // One rAF to let the browser paint the scroll, then measure.
    this._layoutTimer = requestAnimationFrame(() => {
      this._layoutTimer = null;
      this._computeLayout(step);
    }) as unknown as ReturnType<typeof setTimeout>;
  }

  private _computeLayout(step: TourStep): void {
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const pad = step.padding ?? 8;
    const br  = parseFloat(getComputedStyle(el).borderRadius) || 8;

    this.spotlight.set({
      top:          rect.top  - pad,
      left:         rect.left - pad,
      width:        rect.width  + pad * 2,
      height:       rect.height + pad * 2,
      borderRadius: Math.max(br, 4) + pad / 2,
    });

    this.popover.set(this._calcPopoverPos(rect, step));
  }

  private _calcPopoverPos(rect: DOMRect, step: TourStep): PopoverRect {
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    const pad = step.padding ?? 8;

    const sTop    = rect.top    - pad;
    const sBottom = rect.bottom + pad;
    const sLeft   = rect.left   - pad;
    const sRight  = rect.right  + pad;
    const sCx     = rect.left + rect.width  / 2;
    const sCy     = rect.top  + rect.height / 2;

    const fits = {
      top:    sTop    - POPOVER_H_EST - GAP > 12,
      bottom: sBottom + POPOVER_H_EST + GAP < vh - 12,
      left:   sLeft   - POPOVER_W    - GAP > 12,
      right:  sRight  + POPOVER_W    + GAP < vw - 12,
    };

    type Dir = 'top' | 'bottom' | 'left' | 'right';
    const preferred = (step.position ?? 'auto') as Dir | 'auto';
    const opposite: Record<Dir, Dir> = {
      top: 'bottom', bottom: 'top', left: 'right', right: 'left',
    };

    let dir: Dir;
    if (preferred === 'auto') {
      dir = fits.bottom ? 'bottom' : fits.top ? 'top' : fits.right ? 'right' : 'left';
    } else {
      dir = fits[preferred] ? preferred : (fits[opposite[preferred]] ? opposite[preferred] : preferred);
    }

    let top = 0;
    let left = 0;
    let transformOrigin = 'top center';

    switch (dir) {
      case 'bottom':
        top = sBottom + GAP;  left = sCx - POPOVER_W / 2;      transformOrigin = 'top center';    break;
      case 'top':
        top = sTop - POPOVER_H_EST - GAP; left = sCx - POPOVER_W / 2; transformOrigin = 'bottom center'; break;
      case 'right':
        top = sCy - POPOVER_H_EST / 2; left = sRight + GAP;              transformOrigin = 'center left';   break;
      case 'left':
        top = sCy - POPOVER_H_EST / 2; left = sLeft - POPOVER_W - GAP;   transformOrigin = 'center right';  break;
    }

    left = Math.max(12, Math.min(left, vw - POPOVER_W - 12));
    top  = Math.max(12, Math.min(top,  vh - POPOVER_H_EST - 12));

    return { top, left, transformOrigin };
  }

  private _clearTimers(): void {
    if (this._layoutTimer !== null) {
      // Could be a setTimeout id or an rAF id
      clearTimeout(this._layoutTimer);
      cancelAnimationFrame(this._layoutTimer as unknown as number);
      this._layoutTimer = null;
    }
    if (this._resizeTimer !== null) {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = null;
    }
  }
}
